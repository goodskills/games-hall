/* ============================================================
   小张游戏厅 · 访问验证门（gate.js）
   作用：进入游戏厅或任何游戏页面前，需输入验证口令
   配置：只改下面 PASS_HASH 一行即可换口令
         newHash = SHA256( SALT + '|' + 新口令 )
         生成方法：在 https 页面控制台执行
           crypto.subtle.digest('SHA-256', new TextEncoder().encode('xiaozhang-arcade-v1|新口令'))
             .then(b=>console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
         或直接找妙妙改。
   说明：这是"门帘"级防护（前端校验），能挡住随手点进来的访客；
         若要挡专业破解，建议改用 Cloudflare Access。
   ============================================================ */
(function () {
  var SALT = 'xiaozhang-arcade-v1';
  var PASS_HASH = 'a7ee4ed4077ad2207036567c31fc457811a3d74fe2482070cfbc1da9d4f32cfe';
  var KEY = 'xz_gate_v1';
  var BAN_KEY = 'xz_gate_ban';
  var DAYS = 30;
  var MAX_TRY = 5;
  var BAN_MS = 30 * 1000;

  /* ---------- 内置 SHA-256（不依赖 crypto.subtle，file:// 和局域网 http 也能用） ---------- */
  function sha256(ascii) {
    function rightRotate(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = '';
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], primeCounter = k.length;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) { ascii += '\x00'; }
    for (i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) { continue; }
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var oldHash = hash.slice(0, 8);
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
              w[i - 16]
              + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
              + w[i - 7]
              + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
            ) | 0
          );
        var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) { hash[i] = (hash[i] + oldHash[i]) | 0; }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }
  function utf8(str) { try { return unescape(encodeURIComponent(str)); } catch (e) { return str; } }
  function hashOf(pwd) { return sha256(utf8(SALT + '|' + pwd)); }

  /* 调试/换密码用 */
  window.xzHash = hashOf;

  /* ---------- 解锁状态 ---------- */
  function isUnlocked() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return !!(d && d.exp && d.exp > Date.now());
    } catch (e) { return false; }
  }
  function setUnlocked(remember) {
    var exp = remember ? Date.now() + DAYS * 86400000 : Date.now() + 12 * 3600000;
    try { localStorage.setItem(KEY, JSON.stringify({ exp: exp, h: PASS_HASH.slice(0, 8) })); } catch (e) {}
  }
  /* 供游戏厅"锁定本设备"按钮调用 */
  window.xzLock = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };

  /* ---------- 早期隐藏，避免未验证内容闪现 ---------- */
  var root = document.documentElement;
  if (!isUnlocked()) {
    root.className += ' xzg-pending';
    var st = document.createElement('style');
    st.id = 'xzgStyle';
    st.textContent =
      'html.xzg-pending body{visibility:hidden!important}' +
      'html.xzg-locked body{overflow:hidden!important}' +
      '#xzGate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(900px 500px at 50% 0%,#1e3a6e 0%,#0b1220 55%,#070b16 100%);' +
      'font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px}' +
      '#xzGate .xzg-card{width:min(92vw,360px);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);' +
      'border-radius:20px;padding:26px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
      '#xzGate .xzg-ico{font-size:40px;line-height:1}' +
      '#xzGate .xzg-title{font-size:20px;font-weight:900;color:#fff;margin-top:10px;letter-spacing:2px}' +
      '#xzGate .xzg-sub{font-size:12px;color:#8fa3c8;margin-top:8px;line-height:1.7}' +
      '#xzGate input{width:100%;box-sizing:border-box;margin-top:16px;padding:13px 14px;border-radius:12px;' +
      'border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:#fff;font-size:16px;outline:none;text-align:center;letter-spacing:2px}' +
      '#xzGate input:focus{border-color:#38bdf8}' +
      '#xzGate button{width:100%;margin-top:12px;padding:13px;border-radius:12px;border:none;cursor:pointer;' +
      'background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;font-size:16px;font-weight:800}' +
      '#xzGate button:active{transform:scale(.98)}' +
      '#xzGate .xzg-err{min-height:18px;margin-top:10px;font-size:12px;color:#f87171;line-height:1.6}' +
      '#xzGate .xzg-rmb{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;font-size:12px;color:#8fa3c8;cursor:pointer}' +
      '#xzGate .xzg-rmb input{width:auto;margin:0;padding:0;letter-spacing:0}' +
      '#xzGate.shake .xzg-card{animation:xzgShake .3s}' +
      '@keyframes xzgShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}';
    (document.head || root).appendChild(st);
  }

  /* ---------- 构建验证界面 ---------- */
  function buildGate() {
    if (document.getElementById('xzGate')) { return; }
    var g = document.createElement('div');
    g.id = 'xzGate';
    g.innerHTML =
      '<div class="xzg-card">' +
        '<div class="xzg-ico">🔒</div>' +
        '<div class="xzg-title">小张游戏厅</div>' +
        '<div class="xzg-sub">此游戏厅已设置访问验证<br>请输入主人提供的口令</div>' +
        '<input id="xzgPwd" type="password" inputmode="text" autocomplete="off" placeholder="请输入验证口令">' +
        '<button id="xzgGo" type="button">进入游戏厅</button>' +
        '<div class="xzg-err" id="xzgErr"></div>' +
        '<label class="xzg-rmb"><input type="checkbox" id="xzgRmb" checked> 记住本设备 30 天</label>' +
      '</div>';
    document.body.appendChild(g);
    root.classList.remove('xzg-pending');
    root.classList.add('xzg-locked');

    var pwd = document.getElementById('xzgPwd');
    var err = document.getElementById('xzgErr');
    var go = document.getElementById('xzgGo');
    var rmb = document.getElementById('xzgRmb');

    function banned() {
      try { var b = parseInt(localStorage.getItem(BAN_KEY) || '0', 10); return b > Date.now(); } catch (e) { return false; }
    }
    function fail(msg) {
      err.textContent = msg;
      g.classList.add('shake');
      setTimeout(function () { g.classList.remove('shake'); }, 320);
      pwd.value = '';
      pwd.focus();
    }
    function submit() {
      if (banned()) {
        var left = Math.ceil((parseInt(localStorage.getItem(BAN_KEY) || '0', 10) - Date.now()) / 1000);
        fail('尝试次数过多，请 ' + left + ' 秒后再试');
        return;
      }
      var v = (pwd.value || '').trim();
      if (!v) { fail('请输入口令'); return; }
      if (hashOf(v) === PASS_HASH) {
        setUnlocked(rmb.checked);
        try { localStorage.removeItem(BAN_KEY); localStorage.removeItem('xz_gate_try'); } catch (e) {}
        g.style.transition = 'opacity .25s';
        g.style.opacity = '0';
        setTimeout(function () {
          if (g.parentNode) { g.parentNode.removeChild(g); }
          root.classList.remove('xzg-locked', 'xzg-pending');
          var s = document.getElementById('xzgStyle');
          if (s) { s.parentNode.removeChild(s); }
          try { document.dispatchEvent(new Event('xz-unlocked')); } catch (e) {}
        }, 260);
      } else {
        var n = 1;
        try { n = parseInt(localStorage.getItem('xz_gate_try') || '0', 10) + 1; localStorage.setItem('xz_gate_try', String(n)); } catch (e) {}
        if (n >= MAX_TRY) {
          try { localStorage.setItem(BAN_KEY, String(Date.now() + BAN_MS)); localStorage.setItem('xz_gate_try', '0'); } catch (e) {}
          fail('口令错误次数过多，已锁定 30 秒');
        } else {
          fail('口令不正确，还可尝试 ' + (MAX_TRY - n) + ' 次');
        }
      }
    }
    go.addEventListener('click', submit);
    pwd.addEventListener('keydown', function (e) { if (e.key === 'Enter') { submit(); } });
    setTimeout(function () { pwd.focus(); }, 120);
  }

  /* ---------- 启动 ---------- */
  if (isUnlocked()) {
    // 已解锁：清理可能残留的状态
    root.classList.remove('xzg-pending', 'xzg-locked');
  } else if (document.body) {
    buildGate();
  } else {
    document.addEventListener('DOMContentLoaded', buildGate);
  }
})();
