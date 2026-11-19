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
  el('heroPlay').hidden = true;
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
  el('share').hidden = true;
  notice('分享链接已到期', '请联系分享者获取新的观看链接。');
}
function clock(seconds) {
  const whole = Math.floor(seconds);
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}
function init() {
  if (!location.hash || location.hash === '#') return;
  try {
    const parameters = new URLSearchParams(location.hash.slice(1));
    const raw = parameters.get('v');
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
    el('expiry').textContent = new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(expires);
    const name = decodeURIComponent(mediaURL.pathname.split('/').pop());
    const stamp = /^Framecho_(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(name);
    el('title').textContent = stamp ? Number(stamp[2])+' 月 '+Number(stamp[3])+' 日的' : '分享给你的';
    document.title = el('title').textContent + '屏幕录像 · 杰杰的放映室';
    el('details').hidden = false;
    el('byline').textContent = '杰杰通过 Framecho 分享';
    el('recorded').textContent = stamp ? stamp[1]+'.'+stamp[2]+'.'+stamp[3]+'　'+stamp[4]+':'+stamp[5]+'（设备时间）' : '未提供';
  } catch {
    notice('分享链接不完整', '请重新复制分享者发来的完整链接。');
    return;
  }
  if (Date.now() >= expires) { expire(); return; }
  expirationTimer = setTimeout(expire, expires-Date.now());
  el('share').hidden = false;
  notice('正在准备录屏', '正在读取画面和时长…');
  video.hidden = false;
  video.addEventListener('loadedmetadata', () => {
    if (video.videoWidth && video.videoHeight) {
      el('size').textContent = video.videoWidth+' × '+video.videoHeight;
      el('stage').style.aspectRatio = Math.max(1.3, Math.min(3, video.videoWidth / video.videoHeight));
    }
    if (Number.isFinite(video.duration)) el('duration').textContent = clock(video.duration);
    if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(.12,video.duration/4);
  });
  video.addEventListener('loadeddata', () => {
    if (Date.now() >= expires) { expire(); return; }
    state.hidden = true;
    if (!video.controls) play.hidden = false;
    el('heroPlay').hidden = false;
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
  el('heroPlay').onclick = () => {
    if (video.paused) play.click();
    else video.pause();
  };
  video.addEventListener('play', () => { el('heroPlay').textContent = '暂停播放'; });
  video.addEventListener('pause', () => { el('heroPlay').textContent = video.ended ? '重新播放  ↻' : '继续播放  →'; });
  video.addEventListener('ended', () => { el('heroPlay').textContent = '重新播放  ↻'; });
  video.src = mediaURL.href;
}
el('share').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    el('share').textContent = '链接已复制 ✓';
  } catch { el('share').textContent = '请复制浏览器地址栏链接'; }
};
window.addEventListener('hashchange', () => location.reload());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && expires && Date.now() >= expires && video.hasAttribute('src')) expire();
});
init();
