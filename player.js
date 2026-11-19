'use strict';
const el = id => document.getElementById(id);
const video = el('video');
const play = el('play');
const state = el('state');
const expectedHost = 'framecho-share-1455997977.cos.ap-guangzhou.myqcloud.com';
let expires = 0;
let expirationTimer;
let mediaURL;
function notice(title, message, retry = false) {
  play.hidden = true;
  state.hidden = false;
  el('status').textContent = title;
  el('message').textContent = message;
  el('retry').hidden = !retry;
}
function expire() {
  clearTimeout(expirationTimer);
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  el('info').hidden = true;
  notice('分享链接已到期', '请联系分享者获取新的观看链接。');
}
// Older links were produced on the original Los Angeles recorder and contain no zone.
function captureInstant(path, zone, signedAt) {
  const name = decodeURIComponent(path.split('/').pop());
  const match = /^Framecho_(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(name);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function wallAt(instant) {
    const v = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, Number(p.value)]));
    return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  }
  // Try both offsets across a daylight-saving transition.
  const dayMs = 86400000;
  const candidates = [wall - dayMs, wall + dayMs].map(t => wall - (wallAt(t) - t));
  return candidates.filter(t => wallAt(t) === wall && t <= signedAt + 300000)
    .sort((a, b) => b - a)[0] ?? null;
}
let displayTitle = '屏幕录像';
let beijingTime = '';
function setRecordingInfo(parameters, signedAt) {
  const stem = decodeURIComponent(mediaURL.pathname.split('/').pop()).replace(/\.[^.]+$/, '');
  const custom = parameters.get('n')?.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  displayTitle = (custom || (/^Framecho_\d{4}-/.test(stem) ? '屏幕录像' : stem)).slice(0, 256);
  el('title').textContent = displayTitle;
  document.title = displayTitle;
  const t = parameters.get('t');
  const when = t && /^\d{1,10}$/.test(t) ? Number(t) * 1000 :
    captureInstant(mediaURL.pathname, parameters.get('tz') || 'America/Los_Angeles', signedAt);
  if (when == null || when > signedAt + 300000) return;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(when).map(p => [p.type, p.value]));
  beijingTime = parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute+':'+parts.second;
  el('recorded').textContent = beijingTime;
  el('recorded').dateTime = new Date(when).toISOString();
  el('timestamp').hidden = false;
}
function signedURL(params) {
  if (params.has('v')) return params.get('v');
  const path = params.get('p'), id = params.get('k'), date = params.get('d');
  if (!path || !id || !date) throw Error();
  const url = new URL('https://' + expectedHost + '/framecho/' + path);
  url.search = new URLSearchParams({
    'X-Amz-Algorithm':'AWS4-HMAC-SHA256',
    'X-Amz-Credential':id+'/'+date.slice(0,8)+'/ap-guangzhou/s3/aws4_request',
    'X-Amz-Date':date, 'X-Amz-Expires':params.get('e'),
    'X-Amz-SignedHeaders':'host', 'X-Amz-Signature':params.get('s')
  });
  return url.href;
}
function init() {
  if (!location.hash || location.hash === '#') return;
  try {
    if (location.hash.length > 24000) throw Error();
    const parameters = new URLSearchParams(location.hash.slice(1));
    const raw = signedURL(parameters);
    if (!raw || raw.length > 12000) throw Error();
    mediaURL = new URL(raw);
    if (mediaURL.origin !== 'https://' + expectedHost || mediaURL.username || mediaURL.password ||
        !mediaURL.pathname.startsWith('/framecho/') || !/\.(mov|mp4|m4v|webm)$/i.test(mediaURL.pathname) ||
        !/^[0-9a-f]{64}$/i.test(mediaURL.searchParams.get('X-Amz-Signature') || '')) throw Error();
    const date = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(mediaURL.searchParams.get('X-Amz-Date'));
    const ttl = Number(mediaURL.searchParams.get('X-Amz-Expires'));
    if (!date || !Number.isInteger(ttl) || ttl < 1 || ttl > 604800) throw Error();
    expires = Date.parse(date[1]+'-'+date[2]+'-'+date[3]+'T'+date[4]+':'+date[5]+':'+date[6]+'Z') + ttl*1000;
    if (!Number.isFinite(expires)) throw Error();
    setRecordingInfo(parameters, expires - ttl*1000);
  } catch {
    notice('分享链接不完整', '请重新复制分享者发来的完整链接。');
    return;
  }
  if (Date.now() >= expires) { expire(); return; }
  expirationTimer = setTimeout(expire, expires-Date.now());
  el('info').hidden = false;
  notice('正在准备录屏', '正在读取画面和时长…');
  video.hidden = false;
  video.addEventListener('loadedmetadata', () => {
    if (video.videoWidth && video.videoHeight) {
      el('viewer').style.setProperty('--ratio', String(video.videoWidth / video.videoHeight));
    }
    if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(.12,video.duration/4);
  });
  video.addEventListener('loadeddata', () => {
    if (Date.now() >= expires) { expire(); return; }
    state.hidden = true;
    if (!video.controls) play.hidden = false;
  });
  video.addEventListener('error', () => {
    if (Date.now() >= expires) { expire(); return; }
    notice('暂时无法播放', '请检查网络后重试，或使用支持此视频格式的浏览器。', true);
  });
  el('retry').onclick = () => location.reload();
  play.onclick = async () => {
    if (Date.now() >= expires) { expire(); return; }
    try {
      video.controls = true;
      await video.play();
      play.hidden = true;
    } catch {
      notice('浏览器未能开始播放', '请重试，或换用 Safari、Chrome 打开。', true);
    }
  };
  video.src = mediaURL.href;
}
el('share').onclick = async () => {
  try {
    await navigator.clipboard.writeText('名称: ' + displayTitle + '\n日期: ' + (beijingTime || '未知') + '\n录屏文件：' + location.href);
    el('shareLabel').textContent = '已复制 ✓';
  } catch { el('shareLabel').textContent = '请复制浏览器地址栏链接'; }
};
window.addEventListener('hashchange', () => location.reload());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && expires && Date.now() >= expires && video.hasAttribute('src')) expire();
});
init();
