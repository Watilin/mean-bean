'use strict';

const LEFT  = Symbol('left');
const RIGHT = Symbol('right');
const UP    = Symbol('up');
const DOWN  = Symbol('down');

const CW  = Symbol('clockwise');
const CCW = Symbol('counterclockwise');

const GRID_HEIGHT = 12;
const GRID_WIDTH  = 6;
const GRID_PITCH  = 24;

const DROP_X = Math.floor((GRID_WIDTH - 1) / 2);
const DROP_Y = 0;

const ROTATION_TABLE = {};
ROTATION_TABLE[UP] = {};
ROTATION_TABLE[LEFT] = {};
ROTATION_TABLE[DOWN] = {};
ROTATION_TABLE[RIGHT] = {};
ROTATION_TABLE[UP][CCW]    = { x: -1, y: +1, orientation: LEFT  };
ROTATION_TABLE[UP][CW]     = { x: +1, y: +1, orientation: RIGHT };
ROTATION_TABLE[LEFT][CCW]  = { x: +1, y: +1, orientation: DOWN  };
ROTATION_TABLE[LEFT][CW]   = { x: +1, y: -1, orientation: UP    };
ROTATION_TABLE[DOWN][CCW]  = { x: +1, y: -1, orientation: RIGHT };
ROTATION_TABLE[DOWN][CW]   = { x: -1, y: -1, orientation: LEFT  };
ROTATION_TABLE[RIGHT][CCW] = { x: -1, y: -1, orientation: UP    };
ROTATION_TABLE[RIGHT][CW]  = { x: -1, y: +1, orientation: DOWN  };

const EVENT_NAMESPACE = 'MeanBean';

// Bean ////////////////////////////////////////////////////////////////

const Bean = (function () {
  var Bean = Object.create(null);
  var lastId = -1;

  Object.defineProperties(Bean, {
    'COLORS': {
      enumerable: true,
      value: Object.freeze(
        [ 'red', 'yellow', 'green', 'violet', 'blue', 'dark' ]
      )
    },

    // Bean bonds in the spritesheet are ordered as binary values
    // to get multiple bonds, just OR them together
    // e.g. { up, down, right } = 2 | 1 | 4 = 7
    'BOND_NONE'  : { enumerable: true, value: 0 },
    'BOND_DOWN'  : { enumerable: true, value: 1 },
    'BOND_UP'    : { enumerable: true, value: 2 },
    'BOND_RIGHT' : { enumerable: true, value: 4 },
    'BOND_LEFT'  : { enumerable: true, value: 8 },
  });

  Bean.proto = {
    id: NaN,
    color: '',
    logicalX: NaN,
    logicalY: NaN,
    displayX: NaN,
    displayY: NaN,
    group: null,
    bonds: Bean.BOND_NONE,
    isRemoved: false,
    player: null,

    moveTo: function moveTo(x, y) {
      this.logicalX = x;
      this.logicalY = y;
    },

    setDisplayPosition: function setDisplayPosition(x, y) {
      this.displayX = x;
      this.displayY = y;
    },

    normalizeDisplayPosition: function normalizeDisplayPosition() {
      this.displayX = DISPLAY_OFFSETS[this.player].x + this.logicalX * GRID_PITCH;
      this.displayY = DISPLAY_OFFSETS[this.player].y + this.logicalY * GRID_PITCH;
    },

    toString: function toString() {
      return 'Bean{#' + this.id + ' ' + this.color +
        (!isNaN(this.logicalX) ? (' ' + this.logicalX + ',' + this.logicalY) : '') +
        (this.isRemoved ? '*}' : '}');
    }
  };

  Bean.create = function createBean(color) {
    var bean = Object.create(Bean.proto);

    // temp
    bean.player = GameLogic.PLAYER;

    bean.id = ++lastId;

    color = color || BEAN_COLORS[0];
    bean.color = color;

    // console.log('bean created: %s', bean);

    return bean;
  };

  return Object.freeze(Bean);
}());

// Pair ////////////////////////////////////////////////////////////////

const Pair = (function () {
  var Pair = Object.create(null);

  Pair.proto = {
    beanA: null,
    beanB: null,
    orientation: UP, // from beanA to beanB
  };

  Pair.create = function createPair(beanA, beanB) {
    var pair = Object.create(Pair.proto);
    // console.log('pair created (%s, %s)', beanA, beanB);

    pair.beanA = beanA;
    pair.beanB = beanB;

    return pair;
  };

  return Object.freeze(Pair);
}());

// Group ///////////////////////////////////////////////////////////////

const Group = (function () {
  var Group = Object.create(null);
  var lastId = -1;

  Group.proto = {
    beans: null,
    id: NaN,
    color: '',
    toBeRemoved: false,

    checkConsistency: function checkConsistency() {
      var thisGroup = this;
      if (!this.beans.every(function (bean) {
        return bean.group === thisGroup;
      })) {
        throw new Error('inconsistent group %s', this);
      }
    },

    getLength: function getLength() {
      this.checkConsistency();
      return this.beans.length;
    },

    addBean: function addBean(bean) {
      if (this.toBeRemoved) {
        throw new Error('can’t reuse a group that has been emptied: ' + this);
      }
      if (bean.group) bean.group.removeBean(bean);
      if (!this.containsBean(bean)) this.beans.push(bean);
      bean.group = this;
      this.checkConsistency();
      this.updateBonds();
    },

    removeBean: function removeBean(bean) {
      this.checkConsistency();
      console.assert(this.containsBean(bean),
                     'bean %s not in group %s', bean, this);
      this.beans.splice(this.beans.indexOf(bean), 1);
      bean.group = null;
      bean.bonds = Bean.BOND_NONE;
      if (this.beans.length) {
        this.updateBonds();
      }
      else {
        this.toBeRemoved = true;
        // console.log('group %s empty, won’t be used anymore', this);
      }
    },

    forEachBean: function forEachBean(func) {
      // need to iterate over a copy because beans may be removed during
      // the iteration
      this.beans.slice().forEach(func);
    },

    containsBean: function containsBean(bean) {
      return this.beans.includes(bean);
    },

    updateBonds: function updateBonds() {
      var list = this.beans.slice();
      list.forEach(function (bean) {
        bean.bonds = Bean.BOND_NONE;
      });
      while (list.length > 1) {
        var beanA = list.pop();
        var ax = beanA.logicalX;
        var ay = beanA.logicalY;
        list.forEach(function (beanB) {
          var bx = beanB.logicalX;
          var by = beanB.logicalY;
          if (ax === bx) {
            if (+1 === ay - by) {
              beanA.bonds |= Bean.BOND_UP;
              beanB.bonds |= Bean.BOND_DOWN;
            }
            else if (-1 === ay - by) {
              beanA.bonds |= Bean.BOND_DOWN;
              beanB.bonds |= Bean.BOND_UP;
            }
          }
          else if (ay === by) {
            if (+1 === ax - bx) {
              beanA.bonds |= Bean.BOND_LEFT;
              beanB.bonds |= Bean.BOND_RIGHT;
            }
            else if (-1 === ax - bx) {
              beanA.bonds |= Bean.BOND_RIGHT;
              beanB.bonds |= Bean.BOND_LEFT;
            }
          }
        });
      }
    },

    toString: function toString() {
      return 'Group{#' + this.id + ' ' + this.color +
        '[' + this.beans.length +']}' +
        (this.beans.length ?
          (' [ ' + this.beans.map(function (bean) {
            return '#' + bean.id;
          }).join(', ') + ' ]') :
          '');
    }
  };

  Group.create = function createGroup(bean) {
    var group = Object.create(Group.proto);

    if (!bean) throw new Error('you may not create an empty group');
    group.id = ++lastId;

    group.beans = [];
    Array.slice(arguments).forEach(function (bean) {
      group.addBean(bean);
    });
    group.color = bean.color;

    console.log('group created: %s', group);
    return group;
  };

  return Object.freeze(Group);
}());

// GameLogic ///////////////////////////////////////////////////////////

const GameLogic = (function () {
  var GameLogic = Object.create(null);

  Object.defineProperties(GameLogic, {
    'PLAYER'   : { enumerable: true, value: Symbol('player')   },
    'OPPONENT' : { enumerable: true, value: Symbol('opponent') },
  });

  GameLogic.proto = {
    currentPair: null,
    nextPair: null,
    beans: null,
    display: null,
    server: null,
    score: null,
    mainTimer: NaN,
    playerHasControl: false,

    start: function start() {
      this.playerHasControl = true;
      this.drop();

      var thisGameLogic = this;
      this.mainTimer = setInterval(function () {
        try {
          if (thisGameLogic.playerHasControl) thisGameLogic.move(DOWN);
        } catch (err) {
          clearInterval(thisGameLogic.mainTimer);
          throw err;
        }
      }, 1000);
    },

    drop: function drop() {
      if (this.beans[DROP_X][DROP_Y]) {
        this.gameOver();
        return;
      }
      for (var i = 0; i < 6; i++) {
        if (this.beans[i][-1] || this.beans[i][-2]) {
          this.gameOver();
          return;
        }
      }

      var pair = this.getNextPair();
      console.log('=== new round: %s %s ===', pair.beanA, pair.beanB);
      /*
      offset =
        player:   ( GRID_PITCH * 1,  GRID_PITCH * 1 )
        opponent: ( GRID_PITCH * 13, GRID_PITCH * 1 )
      */
      pair.beanA.moveTo(DROP_X, DROP_Y - 1);
      pair.beanB.moveTo(DROP_X, DROP_Y - 2);
      pair.beanA.normalizeDisplayPosition();
      pair.beanB.normalizeDisplayPosition();
      pair.orientation = UP;
      this.currentPair = pair;

    },

    getNextPair: function getNextPair() {
      if (!this.nextPair) {
        this.nextPair = this.server.requestPair();
        this.setPreviewPair(this.nextPair);
      }

      var pair = this.nextPair;
      this.nextPair = this.server.requestPair();
      this.setPreviewPair(this.nextPair);
      return pair;
    },

    setPreviewPair: function setPreviewPair(pair) {
      pair.beanA.setDisplayPosition(8 * GRID_PITCH, 2.5 * GRID_PITCH);
      pair.beanB.setDisplayPosition(8 * GRID_PITCH, 3.5 * GRID_PITCH);
      this.display.registerBean(pair.beanA);
      this.display.registerBean(pair.beanB);
    },

    move: function move(dir) {
      var pair = this.currentPair;
      var ori = pair.orientation;
      var a = pair.beanA;
      var b = pair.beanB;

      var ax = a.logicalX;
      var bx = b.logicalX;
      var ay = a.logicalY;
      var by = b.logicalY;

      this.beans[ax][ay] = null;
      this.beans[bx][by] = null;

      var pushFlag = false;

      switch (dir) {
        case LEFT:
          if (ax > 0 && bx > 0 && (
              (LEFT === ori && !this.beans[bx - 1][by]) ||
              (RIGHT === ori && !this.beans[ax - 1][ay]) ||
              (!this.beans[ax - 1][ay] && !this.beans[bx - 1][by])
          )) {
            a.logicalX = ax - 1;
            b.logicalX = bx - 1;
          }
          break;

        case RIGHT:
          if (ax < GRID_WIDTH - 1 && bx < GRID_WIDTH - 1 && (
              (LEFT === ori && !this.beans[ax + 1][ay]) ||
              (RIGHT === ori && !this.beans[bx + 1][by]) ||
              (!this.beans[ax + 1][ay] && !this.beans[bx + 1][by])
          )) {
            a.logicalX = ax + 1;
            b.logicalX = bx + 1;
          }
          break;

        case DOWN:
          if (ay < GRID_HEIGHT - 1 && by < GRID_HEIGHT - 1 && (
              (UP === ori && !this.beans[ax][ay + 1]) ||
              (DOWN === ori && !this.beans[bx][by + 1]) ||
              (!this.beans[ax][ay + 1] && !this.beans[bx][by + 1])
          )) {
            a.logicalY = ay + 1;
            b.logicalY = by + 1;
          }
          else {
            pushFlag = true;
          }
          break;
      }

      a.normalizeDisplayPosition();
      b.normalizeDisplayPosition();
      this.beans[a.logicalX][a.logicalY] = a;
      this.beans[b.logicalX][b.logicalY] = b;
      if (pushFlag) this.pushDown(pair);
    },

    rotate: function rotate(dir) {
      var pair = this.currentPair;
      var a = pair.beanA;
      var b = pair.beanB;

      var ax = a.logicalX;
      var bx = b.logicalX;
      var ay = a.logicalY;
      var by = b.logicalY;

      this.beans[ax][ay] = null;
      this.beans[bx][by] = null;

      var coordChange = ROTATION_TABLE[pair.orientation][dir];

      var newX = bx + coordChange.x;
      var newY = by + coordChange.y;

      if (newX >= 0 && newX < GRID_WIDTH && newY < GRID_HEIGHT &&
          !this.beans[newX][newY]) {
        // normal case
        b.logicalX = newX;
        b.logicalY = newY;
        pair.orientation = coordChange.orientation;
      }

      else {
        // shift case
        var coordShift = {};
        if (DOWN === coordChange.orientation ||
            UP === coordChange.orientation) {
          coordShift.x = 0;
          coordShift.y = -coordChange.y;
        }
        else {
          coordShift.x = -coordChange.x;
          coordShift.y = 0;
        }
        newX = ax + coordShift.x;
        newY = ay + coordShift.y;

        if (newX >= 0 && newX < GRID_WIDTH && newY < GRID_HEIGHT &&
            !this.beans[newX][newY]) {
          b.logicalX = ax;
          b.logicalY = ay;
          a.logicalX = newX;
          a.logicalY = newY;
          pair.orientation = coordChange.orientation;
        }
      }

      a.normalizeDisplayPosition();
      b.normalizeDisplayPosition();
      this.beans[a.logicalX][a.logicalY] = a;
      this.beans[b.logicalX][b.logicalY] = b;
    },

    pushDown: function pushDown(pair) {
      var a = pair.beanA;
      var b = pair.beanB;

      var ax = a.logicalX;
      var bx = b.logicalX;
      var ay = a.logicalY;
      var by = b.logicalY;

      if (ay < GRID_HEIGHT - 1 && !this.beans[ax][ay + 1]) {
        this.letFall(a);
      }
      if (by < GRID_HEIGHT - 1 && !this.beans[bx][by + 1]) {
        this.letFall(b);
      }

      this.resolve();
    },

    letFall: function letFall(bean) {
      // console.log('letting fall %s (at least)', bean);
      var x = bean.logicalX;
      var y = bean.logicalY;
      var oldY = y;
      while (y < GRID_HEIGHT - 1 && !this.beans[x][y + 1]) y++;
      var fallHeight = y - oldY;

      var beanToFall = bean;
      do {
        if (beanToFall.group) beanToFall.group.removeBean(beanToFall);
        oldY = beanToFall.logicalY;
        this.beans[x][oldY] = null;
        beanToFall.moveTo(x, oldY + fallHeight);
        beanToFall.normalizeDisplayPosition();
        this.beans[x][beanToFall.logicalY] = beanToFall;
        beanToFall = this.beans[x][oldY - 1];
      } while (beanToFall);
    },

    resolve: function resolve(chainLevel) {
      this.playerHasControl = false;
      this.dump();

      chainLevel = chainLevel || 0;

      var i, bean, group, adjacentBeans, lastGroup,
        j = GRID_HEIGHT,
        allGroups = [],
        groupsToRemove = [],
        hoveringBeans = [],
        logic = this;

      // iterating backwards
      while (j--) for (i = GRID_WIDTH; i--; ) {
        bean = this.beans[i][j];
        if (bean) {
          adjacentBeans = [];
          // looking only left and top beans since iteration is backwards
          if (i > 0) adjacentBeans.push(this.beans[i - 1][j]);
          if (j > 0) adjacentBeans.push(this.beans[i][j - 1]);

          adjacentBeans.forEach(function (adj) {
            if (!adj) return;
            if (adj.color === bean.color) {
              if (adj.group && bean.group) {
                if (adj.group !== bean.group) {
                  bean.group.forEachBean(function (otherBean) {
                    adj.group.addBean(otherBean);
                  });
                }
                group = adj.group;
              }
              else if (adj.group) {
                adj.group.addBean(bean);
                group = adj.group;
              }
              else if (bean.group) {
                bean.group.addBean(adj);
                group = bean.group;
              }
              else {
                group = Group.create(bean, adj);
              }
            }
          });

          if (group && !allGroups.includes(group)) allGroups.push(group);
        }
      }

      allGroups.forEach(function (group) {
        if (group.getLength() >= 4) {
          groupsToRemove.push(group);
        }
      });

      if (groupsToRemove.length) {
        setTimeout(function () {
          console.log('- groups will be removed now');
          var hoveringBeans = [];

          groupsToRemove.forEach(function (group) {
            logic.removeGroup(group);
            group.forEachBean(function (bean) {
              if (bean.logicalY <= 0) return;
              var beanOnTop = logic.beans[bean.logicalX][bean.logicalY - 1];
              if (beanOnTop &&
                  beanOnTop.group !== bean.group &&
                  !beanOnTop.isRemoved) {
                hoveringBeans.push(beanOnTop);
              }
            });
          });

          if (hoveringBeans.length) {
            setTimeout(function () {
              console.log('-- beans will fall now');
              hoveringBeans.forEach(function (bean) {
                if (!bean.isRemoved) logic.letFall(bean);
              });
              logic.resolve(chainLevel + 1);
            }, 350);
          }
          else {
            console.log('-- no hovering beans, end');
            logic.playerHasControl = true;
            logic.drop();
          }
        }, 700);
      }
      else {
        console.log('- no groups to remove, end');
        logic.playerHasControl = true;
        logic.drop();
      }
    },

    removeGroup: function removeGroup(group) {
      console.log('removing group %s', group);
      var logic = this;
      group.forEachBean(function (bean) {
        logic.removeBean(bean);
      });
    },

    removeBean: function removeBean(bean) {
      if (bean.isRemoved) throw new Error('bean already removed ' + bean);
      // console.log('removing bean %s', bean);
      this.beans[bean.logicalX][bean.logicalY] = null;
      bean.isRemoved = true;
      this.display.unregisterBean(bean);
    },

    dump: function dump() {
      var output = '    0 1 2 3 4 5\n';
      var styles = [];
      var buffer;
      var stylesBuffer;
      var isLinePopulated;
      for (var j = 0; j < GRID_HEIGHT; j++) {
        buffer = (j < 10 ? ' ' : '') + j + ' ';
        stylesBuffer = [];
        isLinePopulated = false;

        for (var i = 0; i < GRID_WIDTH; i++) {
          var bean = this.beans[i][j];
          var symbol = '';
          if (bean) {
            isLinePopulated = true;
            symbol = '%c' + bean.color.charAt(0).toUpperCase() + '%c';
            stylesBuffer.push('color: ' + bean.color, 'color: default');
          }
          else {
            symbol = '.';
          }
          buffer += ' ' + symbol;
        }

        if (isLinePopulated) {
          output += buffer + '\n';
          styles = styles.concat(stylesBuffer);
        }
      }
      console.log.apply(console, [ output ].concat(styles));
    },

    gameOver: function gameOver() {
      console.log('======= Game Over =======');
      clearInterval(this.mainTimer);
      this.playerHasControl = false;
      this.display.canPaint = false;
      for (var i = GRID_WIDTH; i--; ) {
        for (var j = GRID_HEIGHT; j--; ) {
          var bean = this.beans[i][j];
          if (bean) this.removeBean(bean);
        }
      }
    }
  };

  GameLogic.create = function createGameLogic(display, server) {
    var gameLogic = Object.create(GameLogic.proto);
    console.log('gameLogic created');

    console.assert(display, 'must pass a display to GameLogic.create');
    gameLogic.display = display;

    console.assert(server, 'must pass a server to GameLogic.create');
    gameLogic.server = server;


    var beans = [];
    for (var i = GRID_WIDTH; i--; ) {
      beans[i] = [];
      for (var j = GRID_HEIGHT; j--; ) {
        beans[i][j] = null;
      }
    }
    gameLogic.beans = beans;

    gameLogic.start();

    return gameLogic;
  };

  return Object.freeze(GameLogic);
}());

// Score ///////////////////////////////////////////////////////////////

const Score = (function () {
  var Score = Object.create(null);

  Object.defineProperties(Score, {
    'CHAIN_POWER_TABLE': {
      enumerable: true,
      value: Object.freeze(
        [ 0, 8, 16, 32, 64, 128, 256, 512, 999 ]
      )
    },
  });

  Score.proto = {
    chain: NaN,
    chainPower: NaN,

    upgradeChain: function upgradeChain() {
      this.chain = this.chain + 1 || 0;
      var powerIndex =
        Math.min(this.chain, Score.CHAIN_POWER_TABLE.length - 1);
      this.chainPower = Score.CHAIN_POWER_TABLE[powerIndex];
      console.log('chain step = %d -> power = %d',
        this.chain, this.chainPower);
    }
  };

  Score.create = function createScore() {
    var score = Object.create(Score.proto);
    console.log('score created');

    score.upgradeChain();
    return score;
  };

  return Object.freeze(Score);
}());

// Arena ///////////////////////////////////////////////////////////////

const Arena = (function () {
  var Arena = Object.create(null);

  Object.defineProperties(Arena, {
    'RATIO': { enumerable: true, value: 960 / 674 },
  });

  Arena.proto = {
    gameLogic: null,
    server: null,
    display: null,

    keydown: function keydown(event) {
      if (!this.gameLogic.playerHasControl) return;
      switch (event.keyCode) {
        case 81: // Q
        case 65: // A (Bépo)
          event.preventDefault();
          this.gameLogic.move(LEFT);
          break;
        case 83: // S
        case 85: // U (Bépo)
          event.preventDefault();
          this.gameLogic.move(DOWN);
          break;
        case 68: // D
        case 73: // I (Bépo)
          event.preventDefault();
          this.gameLogic.move(RIGHT);
          break;
        case 37: // left arrow
          event.preventDefault();
          this.gameLogic.rotate(CCW);
          break;
        case 39: // right arrow
          event.preventDefault();
          this.gameLogic.rotate(CW);
          break;
      }
    }
  };

  Arena.create = function createArena($container) {
    var arena = Object.create(Arena.proto);
    console.log('arena created (#' + $container.id + ')');

    arena.server = createServer();

    document.addEventListener(AssetManager.ALL_ASSETS_LOADED_EVENT,
      function listener(event) {
        document.removeEventListener(
          AssetManager.ALL_ASSETS_LOADED_EVENT, listener);

        arena.gameLogic =
          GameLogic.create(arena.display, arena.server);

        document.addEventListener('keydown', function (event) {
          arena.keydown(event);
        }, false);
      });

    arena.display = createDisplay($container);

    return arena;
  };

  return Object.freeze(Arena);
}());

// Server //////////////////////////////////////////////////////////////

let createServer = (function () {
  var serverProto = {
    difficulty: NaN,

    setDifficulty: function setDifficulty(difficulty) {
      this.difficulty = difficulty;
    },

    requestPair: function requestPair() {
      var dif = this.difficulty;
      console.assert(!isNaN(dif), 'difficulty not set at server side');

      var n = 4 + Number(dif > 1);
      return Pair.create(
        Bean.create(Bean.COLORS[Math.floor(n * Math.random())]),
        Bean.create(Bean.COLORS[Math.floor(n * Math.random())])
      );
    }
  };

  return function createServer() {
    var server = Object.create(serverProto);
    console.log('server created');

    server.setDifficulty(2); // will not stay as is

    return server;
  };
}());

// Display /////////////////////////////////////////////////////////////

const DISPLAY_OFFSETS = {};
DISPLAY_OFFSETS[GameLogic.PLAYER] = {
  x: GRID_PITCH * 1,
  y: GRID_PITCH * 1
};
DISPLAY_OFFSETS[GameLogic.OPPONENT] = {
  x: GRID_PITCH * 13,
  y: GRID_PITCH * 1
};

let createDisplay = (function () {
  var displayProto = {
    canvases: null,
    assetManager: null,
    beans: null,
    canPaint: false,

    drawFrame: function drawFrame() {
      if (!this.canPaint) {
        console.warn('painting will stop');
        return;
      }

      var thisDisplay = this;
      requestAnimationFrame(function () {
        thisDisplay.drawFrame();
      });

      var $canvas = this.canvases[0];
      var drawingContext = $canvas.getContext('2d');
      drawingContext.clearRect(0, 0, $canvas.width, $canvas.height);

      this.beans.forEach(function (bean) {
        thisDisplay.drawBean(bean);
      });
    },

    drawBean: function drawBean(bean) {
      var asset = this.assetManager.getAsset('beanSprites');
      var colorOffset = Bean.COLORS.indexOf(bean.color) * asset.spriteY;
      var bondOffset = bean.bonds * asset.spriteX;
      var drawingContext = this.canvases[0].getContext('2d');

      drawingContext.drawImage(
        asset.$img,
        bondOffset, colorOffset,
        asset.spriteX, asset.spriteY,
        bean.displayX, bean.displayY,
        GRID_PITCH, GRID_PITCH
      );
    },

    registerBean: function registerBean(bean) {
      if (!this.beans.includes(bean)) this.beans.push(bean);
    },

    unregisterBean: function unregisterBean(bean) {
      var index = this.beans.indexOf(bean);
      if (index < 0) {
        throw new Error('bean not registered: ' + bean);
      }
      this.beans.splice(index, 1);
    },

    clip: function clip() {
      var $cv = this.canvases[0];
      var cx = $cv.getContext('2d');

      cx.restore(); // restoring from a previous clipping
      cx.save(); // saving before clipping

      cx.beginPath();
      cx.moveTo(        0, GRID_PITCH);
      cx.lineTo($cv.width, GRID_PITCH);
      cx.lineTo($cv.width, $cv.height);
      cx.lineTo(        0, $cv.height);
      cx.closePath();
      cx.clip();
    }
  };

  return function createDisplay($container) {
    var display = Object.create(displayProto);
    console.log('display created');

    console.assert($container,
      'must pass a container to createDisplay');

    var $canvas = document.createElement('canvas');
    var width  = GRID_PITCH * 20;
    var height = GRID_PITCH * 20 / Arena.RATIO;
    $canvas.width  = width;
    $canvas.height = height;

    $container.style.width = width + 'px';
    $container.style.backgroundSize = width + 'px ' + height + 'px';
    $container.appendChild($canvas);

    display.canvases = [ $canvas ];
    display.beans = [];
    display.assetManager = AssetManager.create();

    display.canPaint = true;
    display.clip();
    display.drawFrame();

    return display;
  };
}());

// Animation ///////////////////////////////////////////////////////////

const Animation = (function () {
  var Animation = Object.create(null);

  Animation.proto = {
    startTime: NaN,
    endTime: NaN,
    paintFunction: null,
    layer: null,
  };

  Animation.create = function createAnimation() {
    var animation = Object.create(Animation.proto);


    return animation;
  };

  return Object.freeze(Animation);
}());

// AssetManager ////////////////////////////////////////////////////////

const AssetManager = (function () {
  var AssetManager = Object.create(null);

  Object.defineProperties(AssetManager, {
    'MANIFEST_URL': { enumerable: true, value: 'assets.json' },
    'ALL_ASSETS_LOADED_EVENT': {
      enumerable: true,
      value: EVENT_NAMESPACE + ':allAssetsLoaded',
    },
  });

  AssetManager.proto = {
    assets: null,
    loadCount: NaN,
    assetCount: NaN,
    errorCount: NaN,

    loadResource: function loadResource(resource) {
      switch (resource.type) {
        case 'image':
          this.loadImage(resource);
          break;

        case 'spritesheet':
          this.loadSpritesheet(resource);
          break;

        case 'audio':
          this.loadAudio(resource);
          break;

        default:
          console.warn('unhandled asset type: %s', resource.type);
          break;
      }
    },

    loadImage: function loadImage(resource) {
      var thisManager = this;
      var $img = new Image();

      $img.addEventListener('error', function () {
        thisManager.errorCount++;
        thisManager.checkCompletion();
      });

      $img.addEventListener('load', function () {
        thisManager.assets[resource.name] = $img;
        thisManager.loadCount++;
        thisManager.checkCompletion();
      });

      $img.src = resource.url;
    },

    loadSpritesheet: function loadSpritesheet(resource) {
      var thisManager = this;
      var $img = new Image();

      $img.addEventListener('error', function () {
        thisManager.errorCount++;
        thisManager.checkCompletion();
      });

      $img.addEventListener('load', function () {
        thisManager.assets[resource.name] = {
          $img: $img,
          spriteX: resource.spriteX,
          spriteY: resource.spriteY
        };
        thisManager.loadCount++;
        thisManager.checkCompletion();
      });

      $img.src = resource.url;
    },

    loadAudio: function loadAudio(resource) {
      // TODO handle audio assets
      this.loadCount++;
      this.checkCompletion();
    },

    checkCompletion: function checkCompletion() {
      if (this.loadCount + this.errorCount === this.assetCount) {
        document.dispatchEvent(
          new CustomEvent(AssetManager.ALL_ASSETS_LOADED_EVENT));
      }
    },

    getAsset: function getAsset(name) {
      if (!(name in this.assets)) {
        throw new Error('asset ' + name + ' not found');
      }
      return this.assets[name];
    }
  };

  AssetManager.create = function createAssetManager() {
    var assetManager = Object.create(AssetManager.proto);
    console.log('assetManager created');

    assetManager.assets = {};
    assetManager.loadCount = 0;
    assetManager.errorCount = 0;

    var req = new XMLHttpRequest();
    req.open('GET', AssetManager.MANIFEST_URL);

    // prevents Firefox from stupidly assuming the file is xml
    req.overrideMimeType('application/json; charset=utf-8');

    req.addEventListener('load', function () {
      var manifest;
      try {
        manifest = JSON.parse(this.responseText);
      } catch (err) {
        console.error('error while parsing asset manifest', err);
      }
      if (!manifest) return;

      assetManager.assetCount = manifest.length;
      manifest.forEach(function (resource) {
        assetManager.loadResource(resource);
      });
    });
    req.send();

    return assetManager;
  };

  return Object.freeze(AssetManager);
}());
