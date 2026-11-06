'use strict';
/**
 * 房间管理：房间号、玩家、房主、开始/结束、掉线重连、定时清理。
 * 所有数据都在内存里（重启即清空），这样部署最简单、不需要数据库。
 */
var GAMES = require('./games');

var ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I O 0 1

/* ------------------------------------------------------------------
 * 机器人"思考时间"（每次出牌前的等待间隔）
 * 集中定义在这里，游戏模块可用 botThinkMs / botThinkJitterMs 覆盖（数值或 (state)=>number 均可）。
 *   实际间隔 = base + Math.random() * jitter
 * 唬牌（cheat）把 base 覆盖为 30000ms（30 秒），见 server/games/cheat.js。
 * ------------------------------------------------------------------ */
var DEFAULT_BOT_THINK_MS = 600;
var DEFAULT_BOT_THINK_JITTER_MS = 700;

function pick(o, state, fallback) {
  if (o === undefined) return fallback;
  return (typeof o === 'function') ? o(state) : o;
}
/** 计算某个游戏下一次机器人动作的等待毫秒数 */
function botThinkDelay(g, state) {
  var base = pick(g.botThinkMs, state, DEFAULT_BOT_THINK_MS);
  var jitter = pick(g.botThinkJitterMs, state, DEFAULT_BOT_THINK_JITTER_MS);
  return base + Math.random() * jitter;
}
var rooms = new Map();
var MAX_PLAYERS = 8;

function genRoomId() {
  var s = '', tries = 0;
  do {
    s = '';
    for (var i = 0; i < 4; i++) s += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    tries++;
  } while (rooms.has(s) && tries < 50);
  return s;
}
function genPlayerId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function Room(id, gameId) {
  this.id = id;
  this.gameId = gameId;
  this.game = GAMES[gameId];
  this.options = {};
  for (var k in this.game.defaults) this.options[k] = this.game.defaults[k];
  this.players = [];   // { id, name, socketIds:Set, connected }
  this.hostId = null;
  this.phase = 'lobby'; // lobby | playing
  this.state = null;
  this.createdAt = Date.now();
  this.lastActivity = Date.now();
  this.timer = null;
}

Room.prototype.touch = function () { this.lastActivity = Date.now(); };

Room.prototype.activePlayers = function () {
  return this.players.slice();
};

Room.prototype.findPlayer = function (id) {
  for (var i = 0; i < this.players.length; i++) if (this.players[i].id === id) return this.players[i];
  return null;
};

Room.prototype.addPlayer = function (name, existingId) {
  if (existingId) {
    var ex = this.findPlayer(existingId);
    if (ex) { ex.name = name || ex.name; this.touch(); return ex; }
  }
  if (this.players.length >= MAX_PLAYERS) return null;
  var p = { id: genPlayerId(), name: (name || '玩家').slice(0, 12), socketIds: new Set(), connected: true };
  this.players.push(p);
  if (!this.hostId) this.hostId = p.id;
  this.touch();
  return p;
};

Room.prototype.attachSocket = function (playerId, socketId) {
  var p = this.findPlayer(playerId);
  if (!p) return null;
  p.socketIds.add(socketId);
  p.connected = true;
  this.touch();
  return p;
};

Room.prototype.detachSocket = function (playerId, socketId) {
  var p = this.findPlayer(playerId);
  if (!p) return;
  p.socketIds.delete(socketId);
  p.connected = p.socketIds.size > 0;
  this.touch();
};

Room.prototype.removePlayer = function (id) {
  var idx = -1;
  for (var i = 0; i < this.players.length; i++) if (this.players[i].id === id) idx = i;
  if (idx < 0) return;
  this.players.splice(idx, 1);
  if (this.hostId === id) this.hostId = this.players.length ? this.players[0].id : null;
  this.touch();
};

/* ---------------- 机器人 ---------------- */
Room.prototype.botCount = function () {
  return this.players.filter(function (p) { return p.isBot; }).length;
};

/** 房主添加一个机器人（仅大厅阶段可加） */
Room.prototype.addBot = function () {
  var g = this.game;
  if (this.phase === 'playing') return { ok: false, error: '牌局进行中，请等本局结束再加机器人' };
  if (this.players.length >= MAX_PLAYERS) return { ok: false, error: '房间已满（最多 ' + MAX_PLAYERS + ' 人）' };
  if (this.players.length >= g.maxPlayers) {
    return { ok: false, error: '本游戏最多 ' + g.maxPlayers + ' 人，加不下了' };
  }
  var n = this.botCount() + 1;
  var p = {
    id: 'BOT' + genPlayerId(),
    name: ('机器人' + n).slice(0, 12),
    socketIds: new Set(),
    connected: true,
    isBot: true
  };
  this.players.push(p);
  this.touch();
  return { ok: true, bot: { id: p.id, name: p.name } };
};

/** 房主移除一个机器人 */
Room.prototype.removeBot = function (id) {
  var p = this.findPlayer(id);
  if (!p || !p.isBot) return { ok: false, error: '该玩家不是机器人' };
  if (this.phase === 'playing') return { ok: false, error: '牌局进行中不能移除机器人' };
  this.removePlayer(id);
  return { ok: true };
};

/**
 * 机器人驱动器：每当房间状态变化，就看看是否轮到某个机器人行动，
 * 若是则等待一个"思考时间"（由 botThinkDelay 统一计算，唬牌为 30 秒）后代它打出，
 * 然后继续下一个。用 _botBusy 防止并发递归。
 */
Room.prototype.driveBots = function (broadcast) {
  var self = this;
  if (this._botBusy) return;
  var g = this.game;
  if (!g || !g.botAct) return;
  this._botBusy = true;

  var tick = function () {
    if (!self.state) { self._botBusy = false; return; }
    var r = null;
    try { r = g.botAct(self.state); } catch (e) { self._botBusy = false; return; }
    if (!r || !r.playerId) { self._botBusy = false; return; }
    setTimeout(function () {
      if (!self.state) { self._botBusy = false; return; }
      // 用「不传参的闭包」把广播转交给游戏模块：游戏里写的是 ctx.broadcast()，
      // 若直接把原始 broadcast(room) 传下去，定时器回调就会以 undefined 房间调用它。
      var bc = function () { broadcast(self); };
      var res = self.handleAction(r.playerId, r.action, bc);
      if (!res || res.ok === false) {
        // 机器人动作被拒（例如规则不允许）→ 停下来，避免死循环烧 CPU
        self._botBusy = false;
        return;
      }
      broadcast(self);
      tick();
    }, botThinkDelay(g, self.state));
  };
  tick();
};

/** 当前房间里机器人下一次动作的等待毫秒数（自检脚本用它验证间隔配置） */
Room.prototype.botThinkDelay = function () {
  return botThinkDelay(this.game, this.state);
};

Room.prototype.clearTimer = function () {
  if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  this._timerFn = null;
};

/** 手动触发当前挂起的定时回调（自检脚本用它模拟"倒计时到了"，无需真的等待） */
Room.prototype.fireTimer = function () {
  var fn = this._timerFn;
  this.clearTimer();
  if (fn) { fn(); return true; }
  return false;
};

/**
 * 给游戏模块用的上下文。
 *
 * 注意 broadcast 的包装：游戏模块里一律写 `ctx.broadcast()`（**不传参数**），
 * 而调用方传进来的 broadcast 有两种形态：
 *   - socket.js 的闭包 `function () { broadcast(room); }`（0 个参数）
 *   - 原始 `function (room) {...}`（1 个参数，例如 driveBots 直接转交过来的）
 * 早期直接把原函数挂到 ctx.broadcast 上，导致后一种形态下
 * `ctx.broadcast()` 变成 `broadcast(undefined)` → `room.players` 读不到 → **整个服务崩溃**。
 * 这里按函数声明的参数个数统一补上「当前房间」，两种形态都能安全调用。
 */
Room.prototype.ctx = function (broadcast) {
  var self = this;
  var fire = function () {
    if (typeof broadcast !== 'function') return;
    if (broadcast.length === 0) broadcast();
    else broadcast(self);
  };
  return {
    room: self,
    setTimer: function (fn, ms) { self.clearTimer(); self._timerFn = fn; self.timer = setTimeout(fn, ms); },
    clearTimer: function () { self.clearTimer(); },
    broadcast: fire
  };
};

/** 房主开局 / 下一局 */
Room.prototype.startGame = function (broadcast) {
  var g = this.game;
  var n = this.players.length;
  if (n < g.minPlayers) return { ok: false, error: '至少需要 ' + g.minPlayers + ' 人才能开始' };
  if (n > g.maxPlayers) return { ok: false, error: '本游戏最多 ' + g.maxPlayers + ' 人' };
  if (!this.state) g.init(this);
  // 把房主最新的设置同步进当前局。
  // 否则 state.opts 只在 init 时读一次，大厅里改的设置要到「重新开始」才生效。
  if (this.state && this.state.opts) {
    for (var k in g.defaults) {
      this.state.opts[k] = (this.options && this.options[k] !== undefined) ? this.options[k] : g.defaults[k];
      this.options[k] = this.state.opts[k];
    }
  }
  this.phase = 'playing';
  var ctx = this.ctx(broadcast);
  g.start(this, ctx);
  // 开局后立刻进入结束态（例如筹码不足）时，仍放回大厅
  if (this.state && END_STAGES.indexOf(this.state.stage) >= 0) this.phase = 'lobby';
  this.touch();
  return { ok: true };
};

/** 回合结束类状态：进入这些状态就把房间放回大厅，方便新朋友中途加入 */
var END_STAGES = ['settle', 'ended', 'over'];

Room.prototype.handleAction = function (playerId, action, broadcast) {
  var g = this.game;
  if (!this.state) return { ok: false, error: '牌局尚未开始' };
  var ctx = this.ctx(broadcast);
  var res = g.handle(this, playerId, action || {}, ctx);
  // 一局结束 / 整场结束 → 回到大厅，允许加入
  if (res && res.ok && this.state && END_STAGES.indexOf(this.state.stage) >= 0) {
    this.phase = 'lobby';
  }
  this.touch();
  return res;
};

/** 回合结束后回到 lobby，方便新朋友加入 */
Room.prototype.toLobby = function () { this.phase = 'lobby'; this.touch(); };

Room.prototype.publicInfo = function (forId) {
  var g = this.game;
  return {
    roomId: this.id,
    gameId: this.gameId,
    gameName: g.name,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    rules: g.rules,
    optionFields: g.optionFields,
    options: this.options,
    hostId: this.hostId,
    phase: this.phase,
    nextLabel: g.nextLabel,
    meId: forId,
    players: this.players.map(function (p) {
      return { id: p.id, name: p.name, connected: p.connected, isHost: p.id === this.hostId, isBot: !!p.isBot };
    }.bind(this))
  };
};

Room.prototype.snapshot = function (playerId) {
  var g = this.game;
  var view = g.view ? g.view(this, playerId) : null;
  return {
    room: this.publicInfo(playerId),
    view: view,
    serverTime: Date.now()
  };
};

function createRoom(gameId) {
  if (!GAMES[gameId]) return null;
  var r = new Room(genRoomId(), gameId);
  rooms.set(r.id, r);
  return r;
}
function getRoom(id) { return rooms.get(String(id || '').toUpperCase()); }
function removeRoom(id) {
  var r = rooms.get(id);
  if (r) { r.clearTimer(); rooms.delete(id); }
}

/** 每小时清理一次超过 6 小时无活动的房间 */
function startCleanup() {
  setInterval(function () {
    var now = Date.now();
    rooms.forEach(function (r, id) {
      if (now - r.lastActivity > 6 * 3600 * 1000) removeRoom(id);
    });
  }, 3600 * 1000);
}

module.exports = {
  rooms: rooms,
  GAMES: GAMES,
  MAX_PLAYERS: MAX_PLAYERS,
  createRoom: createRoom,
  getRoom: getRoom,
  removeRoom: removeRoom,
  startCleanup: startCleanup,
  genPlayerId: genPlayerId
};
