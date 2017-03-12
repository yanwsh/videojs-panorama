(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*! npm.im/intervalometer */
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function intervalometer(cb, request, cancel, requestParameter) {
	var requestId;
	var previousLoopTime;
	function loop(now) {
		// must be requested before cb() because that might call .stop()
		requestId = request(loop, requestParameter);

		// called with "ms since last call". 0 on start()
		cb(now - (previousLoopTime || now));

		previousLoopTime = now;
	}
	return {
		start: function start() {
			if (!requestId) { // prevent double starts
				loop(0);
			}
		},
		stop: function stop() {
			cancel(requestId);
			requestId = null;
			previousLoopTime = 0;
		}
	};
}

function frameIntervalometer(cb) {
	return intervalometer(cb, requestAnimationFrame, cancelAnimationFrame);
}

function timerIntervalometer(cb, delay) {
	return intervalometer(cb, setTimeout, clearTimeout, delay);
}

exports.intervalometer = intervalometer;
exports.frameIntervalometer = frameIntervalometer;
exports.timerIntervalometer = timerIntervalometer;
},{}],2:[function(require,module,exports){
/*! npm.im/iphone-inline-video */
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var Symbol = _interopDefault(require('poor-mans-symbol'));
var intervalometer = require('intervalometer');

function preventEvent(element, eventName, toggleProperty, preventWithProperty) {
	function handler(e) {
		if (Boolean(element[toggleProperty]) === Boolean(preventWithProperty)) {
			e.stopImmediatePropagation();
			// console.log(eventName, 'prevented on', element);
		}
		delete element[toggleProperty];
	}
	element.addEventListener(eventName, handler, false);

	// Return handler to allow to disable the prevention. Usage:
	// const preventionHandler = preventEvent(el, 'click');
	// el.removeEventHandler('click', preventionHandler);
	return handler;
}

function proxyProperty(object, propertyName, sourceObject, copyFirst) {
	function get() {
		return sourceObject[propertyName];
	}
	function set(value) {
		sourceObject[propertyName] = value;
	}

	if (copyFirst) {
		set(object[propertyName]);
	}

	Object.defineProperty(object, propertyName, {get: get, set: set});
}

function proxyEvent(object, eventName, sourceObject) {
	sourceObject.addEventListener(eventName, function () { return object.dispatchEvent(new Event(eventName)); });
}

function dispatchEventAsync(element, type) {
	Promise.resolve().then(function () {
		element.dispatchEvent(new Event(type));
	});
}

// iOS 10 adds support for native inline playback + silent autoplay
var isWhitelisted = /iPhone|iPod/i.test(navigator.userAgent) && !matchMedia('(-webkit-video-playable-inline)').matches;

var ಠ = Symbol();
var ಠevent = Symbol();
var ಠplay = Symbol('nativeplay');
var ಠpause = Symbol('nativepause');

/**
 * UTILS
 */

function getAudioFromVideo(video) {
	var audio = new Audio();
	proxyEvent(video, 'play', audio);
	proxyEvent(video, 'playing', audio);
	proxyEvent(video, 'pause', audio);
	audio.crossOrigin = video.crossOrigin;

	// 'data:' causes audio.networkState > 0
	// which then allows to keep <audio> in a resumable playing state
	// i.e. once you set a real src it will keep playing if it was if .play() was called
	audio.src = video.src || video.currentSrc || 'data:';

	// if (audio.src === 'data:') {
	//   TODO: wait for video to be selected
	// }
	return audio;
}

var lastRequests = [];
var requestIndex = 0;
var lastTimeupdateEvent;

function setTime(video, time, rememberOnly) {
	// allow one timeupdate event every 200+ ms
	if ((lastTimeupdateEvent || 0) + 200 < Date.now()) {
		video[ಠevent] = true;
		lastTimeupdateEvent = Date.now();
	}
	if (!rememberOnly) {
		video.currentTime = time;
	}
	lastRequests[++requestIndex % 3] = time * 100 | 0 / 100;
}

function isPlayerEnded(player) {
	return player.driver.currentTime >= player.video.duration;
}

function update(timeDiff) {
	var player = this;
	// console.log('update', player.video.readyState, player.video.networkState, player.driver.readyState, player.driver.networkState, player.driver.paused);
	if (player.video.readyState >= player.video.HAVE_FUTURE_DATA) {
		if (!player.hasAudio) {
			player.driver.currentTime = player.video.currentTime + ((timeDiff * player.video.playbackRate) / 1000);
			if (player.video.loop && isPlayerEnded(player)) {
				player.driver.currentTime = 0;
			}
		}
		setTime(player.video, player.driver.currentTime);
	} else if (player.video.networkState === player.video.NETWORK_IDLE && !player.video.buffered.length) {
		// this should happen when the source is available but:
		// - it's potentially playing (.paused === false)
		// - it's not ready to play
		// - it's not loading
		// If it hasAudio, that will be loaded in the 'emptied' handler below
		player.video.load();
		// console.log('Will load');
	}

	// console.assert(player.video.currentTime === player.driver.currentTime, 'Video not updating!');

	if (player.video.ended) {
		delete player.video[ಠevent]; // allow timeupdate event
		player.video.pause(true);
	}
}

/**
 * METHODS
 */

function play() {
	// console.log('play');
	var video = this;
	var player = video[ಠ];

	// if it's fullscreen, use the native player
	if (video.webkitDisplayingFullscreen) {
		video[ಠplay]();
		return;
	}

	if (player.driver.src !== 'data:' && player.driver.src !== video.src) {
		// console.log('src changed on play', video.src);
		setTime(video, 0, true);
		player.driver.src = video.src;
	}

	if (!video.paused) {
		return;
	}
	player.paused = false;

	if (!video.buffered.length) {
		// .load() causes the emptied event
		// the alternative is .play()+.pause() but that triggers play/pause events, even worse
		// possibly the alternative is preventing this event only once
		video.load();
	}

	player.driver.play();
	player.updater.start();

	if (!player.hasAudio) {
		dispatchEventAsync(video, 'play');
		if (player.video.readyState >= player.video.HAVE_ENOUGH_DATA) {
			// console.log('onplay');
			dispatchEventAsync(video, 'playing');
		}
	}
}
function pause(forceEvents) {
	// console.log('pause');
	var video = this;
	var player = video[ಠ];

	player.driver.pause();
	player.updater.stop();

	// if it's fullscreen, the developer the native player.pause()
	// This is at the end of pause() because it also
	// needs to make sure that the simulation is paused
	if (video.webkitDisplayingFullscreen) {
		video[ಠpause]();
	}

	if (player.paused && !forceEvents) {
		return;
	}

	player.paused = true;
	if (!player.hasAudio) {
		dispatchEventAsync(video, 'pause');
	}
	if (video.ended) {
		video[ಠevent] = true;
		dispatchEventAsync(video, 'ended');
	}
}

/**
 * SETUP
 */

function addPlayer(video, hasAudio) {
	var player = video[ಠ] = {};
	player.paused = true; // track whether 'pause' events have been fired
	player.hasAudio = hasAudio;
	player.video = video;
	player.updater = intervalometer.frameIntervalometer(update.bind(player));

	if (hasAudio) {
		player.driver = getAudioFromVideo(video);
	} else {
		video.addEventListener('canplay', function () {
			if (!video.paused) {
				// console.log('oncanplay');
				dispatchEventAsync(video, 'playing');
			}
		});
		player.driver = {
			src: video.src || video.currentSrc || 'data:',
			muted: true,
			paused: true,
			pause: function () {
				player.driver.paused = true;
			},
			play: function () {
				player.driver.paused = false;
				// media automatically goes to 0 if .play() is called when it's done
				if (isPlayerEnded(player)) {
					setTime(video, 0);
				}
			},
			get ended() {
				return isPlayerEnded(player);
			}
		};
	}

	// .load() causes the emptied event
	video.addEventListener('emptied', function () {
		// console.log('driver src is', player.driver.src);
		var wasEmpty = !player.driver.src || player.driver.src === 'data:';
		if (player.driver.src && player.driver.src !== video.src) {
			// console.log('src changed to', video.src);
			setTime(video, 0, true);
			player.driver.src = video.src;
			// playing videos will only keep playing if no src was present when .play()’ed
			if (wasEmpty) {
				player.driver.play();
			} else {
				player.updater.stop();
			}
		}
	}, false);

	// stop programmatic player when OS takes over
	video.addEventListener('webkitbeginfullscreen', function () {
		if (!video.paused) {
			// make sure that the <audio> and the syncer/updater are stopped
			video.pause();

			// play video natively
			video[ಠplay]();
		} else if (hasAudio && !player.driver.buffered.length) {
			// if the first play is native,
			// the <audio> needs to be buffered manually
			// so when the fullscreen ends, it can be set to the same current time
			player.driver.load();
		}
	});
	if (hasAudio) {
		video.addEventListener('webkitendfullscreen', function () {
			// sync audio to new video position
			player.driver.currentTime = video.currentTime;
			// console.assert(player.driver.currentTime === video.currentTime, 'Audio not synced');
		});

		// allow seeking
		video.addEventListener('seeking', function () {
			if (lastRequests.indexOf(video.currentTime * 100 | 0 / 100) < 0) {
				// console.log('User-requested seeking');
				player.driver.currentTime = video.currentTime;
			}
		});
	}
}

function overloadAPI(video) {
	var player = video[ಠ];
	video[ಠplay] = video.play;
	video[ಠpause] = video.pause;
	video.play = play;
	video.pause = pause;
	proxyProperty(video, 'paused', player.driver);
	proxyProperty(video, 'muted', player.driver, true);
	proxyProperty(video, 'playbackRate', player.driver, true);
	proxyProperty(video, 'ended', player.driver);
	proxyProperty(video, 'loop', player.driver, true);
	preventEvent(video, 'seeking');
	preventEvent(video, 'seeked');
	preventEvent(video, 'timeupdate', ಠevent, false);
	preventEvent(video, 'ended', ಠevent, false); // prevent occasional native ended events
}

function enableInlineVideo(video, hasAudio, onlyWhitelisted) {
	if ( hasAudio === void 0 ) hasAudio = true;
	if ( onlyWhitelisted === void 0 ) onlyWhitelisted = true;

	if ((onlyWhitelisted && !isWhitelisted) || video[ಠ]) {
		return;
	}
	addPlayer(video, hasAudio);
	overloadAPI(video);
	video.classList.add('IIV');
	if (!hasAudio && video.autoplay) {
		video.play();
	}
	if (!/iPhone|iPod|iPad/.test(navigator.platform)) {
		console.warn('iphone-inline-video is not guaranteed to work in emulated environments');
	}
}

enableInlineVideo.isWhitelisted = isWhitelisted;

module.exports = enableInlineVideo;
},{"intervalometer":1,"poor-mans-symbol":3}],3:[function(require,module,exports){
'use strict';

var index = typeof Symbol === 'undefined' ? function (description) {
	return '@' + (description || '@') + Math.random();
} : Symbol;

module.exports = index;
},{}],4:[function(require,module,exports){
/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/30/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _Detector = require('../lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _MobileBuffering = require('../lib/MobileBuffering');

var _MobileBuffering2 = _interopRequireDefault(_MobileBuffering);

var _Util = require('../lib/Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var HAVE_CURRENT_DATA = 2;

var BaseCanvas = function BaseCanvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    return {
        constructor: function init(player, options) {
            this.settings = options;
            //basic settings
            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.videoType = options.videoType;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;

            //define render
            this.renderer = new THREE.WebGLRenderer();
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(this.width, this.height);
            this.renderer.autoClear = false;
            this.renderer.setClearColor(0x000000, 1);

            //define texture, on ie 11, we need additional helper canvas to solve rendering issue.
            var video = settings.getTech(player);
            this.supportVideoTexture = _Detector2.default.supportVideoTexture();
            this.liveStreamOnSafari = _Detector2.default.isLiveStreamOnSafari(video);
            if (this.liveStreamOnSafari) this.supportVideoTexture = false;
            if (!this.supportVideoTexture) {
                this.helperCanvas = player.addChild("HelperCanvas", {
                    video: video,
                    width: options.helperCanvas.width ? options.helperCanvas.width : this.width,
                    height: options.helperCanvas.height ? options.helperCanvas.height : this.height
                });
                var context = this.helperCanvas.el();
                this.texture = new THREE.Texture(context);
            } else {
                this.texture = new THREE.Texture(video);
            }

            video.style.visibility = "hidden";

            this.texture.generateMipmaps = false;
            this.texture.minFilter = THREE.LinearFilter;
            this.texture.maxFilter = THREE.LinearFilter;
            this.texture.format = THREE.RGBFormat;

            this.el_ = this.renderer.domElement;
            this.el_.classList.add('vjs-video-canvas');

            options.el = this.el_;
            baseComponent.call(this, player, options);

            this.attachControlEvents();
            this.player().on("play", function () {
                this.time = new Date().getTime();
                this.animate();
            }.bind(this));
        },

        attachControlEvents: function attachControlEvents() {
            this.on('mousemove', this.handleMouseMove.bind(this));
            this.on('touchmove', this.handleTouchMove.bind(this));
            this.on('mousedown', this.handleMouseDown.bind(this));
            this.on('touchstart', this.handleTouchStart.bind(this));
            this.on('mouseup', this.handleMouseUp.bind(this));
            this.on('touchend', this.handleTouchEnd.bind(this));
            if (this.settings.scrollable) {
                this.on('mousewheel', this.handleMouseWheel.bind(this));
                this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
            }
            this.on('mouseenter', this.handleMouseEnter.bind(this));
            this.on('mouseleave', this.handleMouseLease.bind(this));
        },

        handleResize: function handleResize() {
            this.width = this.player().el().offsetWidth, this.height = this.player().el().offsetHeight;
            this.renderer.setSize(this.width, this.height);
        },

        handleMouseUp: function handleMouseUp(event) {
            this.mouseDown = false;
            if (this.clickToToggle) {
                var clientX = event.clientX || event.changedTouches && event.changedTouches[0].clientX;
                var clientY = event.clientY || event.changedTouches && event.changedTouches[0].clientY;
                if (typeof clientX === "undefined" || clientY === "undefined") return;
                var diffX = Math.abs(clientX - this.onPointerDownPointerX);
                var diffY = Math.abs(clientY - this.onPointerDownPointerY);
                if (diffX < 0.1 && diffY < 0.1) this.player().paused() ? this.player().play() : this.player().pause();
            }
        },

        handleMouseDown: function handleMouseDown(event) {
            event.preventDefault();
            var clientX = event.clientX || event.touches && event.touches[0].clientX;
            var clientY = event.clientY || event.touches && event.touches[0].clientY;
            if (typeof clientX === "undefined" || clientY === "undefined") return;
            this.mouseDown = true;
            this.onPointerDownPointerX = clientX;
            this.onPointerDownPointerY = clientY;
            this.onPointerDownLon = this.lon;
            this.onPointerDownLat = this.lat;
        },

        handleTouchStart: function handleTouchStart(event) {
            if (event.touches.length > 1) {
                this.isUserPinch = true;
                this.multiTouchDistance = _Util2.default.getTouchesDistance(event.touches);
            }
            this.handleMouseDown(event);
        },

        handleTouchEnd: function handleTouchEnd(event) {
            this.isUserPinch = false;
            this.handleMouseUp(event);
        },

        handleMouseMove: function handleMouseMove(event) {
            var clientX = event.clientX || event.touches && event.touches[0].clientX;
            var clientY = event.clientY || event.touches && event.touches[0].clientY;
            if (typeof clientX === "undefined" || clientY === "undefined") return;
            if (this.settings.clickAndDrag) {
                if (this.mouseDown) {
                    this.lon = (this.onPointerDownPointerX - clientX) * 0.2 + this.onPointerDownLon;
                    this.lat = (clientY - this.onPointerDownPointerY) * 0.2 + this.onPointerDownLat;
                }
            } else {
                var x = event.pageX - this.el_.offsetLeft;
                var y = event.pageY - this.el_.offsetTop;
                this.lon = x / this.width * 430 - 225;
                this.lat = y / this.height * -180 + 90;
            }
        },

        handleTouchMove: function handleTouchMove(event) {
            //handle single touch event,
            if (!this.isUserPinch || event.touches.length <= 1) {
                this.handleMouseMove(event);
            }
        },

        handleMobileOrientation: function handleMobileOrientation(event) {
            if (typeof event.rotationRate === "undefined") return;
            var x = event.rotationRate.alpha;
            var y = event.rotationRate.beta;
            var portrait = typeof event.portrait !== "undefined" ? event.portrait : window.matchMedia("(orientation: portrait)").matches;
            var landscape = typeof event.landscape !== "undefined" ? event.landscape : window.matchMedia("(orientation: landscape)").matches;
            var orientation = event.orientation || window.orientation;

            if (portrait) {
                this.lon = this.lon - y * this.settings.mobileVibrationValue;
                this.lat = this.lat + x * this.settings.mobileVibrationValue;
            } else if (landscape) {
                var orientationDegree = -90;
                if (typeof orientation != "undefined") {
                    orientationDegree = orientation;
                }

                this.lon = orientationDegree == -90 ? this.lon + x * this.settings.mobileVibrationValue : this.lon - x * this.settings.mobileVibrationValue;
                this.lat = orientationDegree == -90 ? this.lat + y * this.settings.mobileVibrationValue : this.lat - y * this.settings.mobileVibrationValue;
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            event.stopPropagation();
            event.preventDefault();
        },

        handleMouseEnter: function handleMouseEnter(event) {
            this.isUserInteracting = true;
        },

        handleMouseLease: function handleMouseLease(event) {
            this.isUserInteracting = false;
            if (this.mouseDown) {
                this.mouseDown = false;
            }
        },

        animate: function animate() {
            this.requestAnimationId = requestAnimationFrame(this.animate.bind(this));
            if (!this.player().paused()) {
                if (typeof this.texture !== "undefined" && (!this.isPlayOnMobile && this.player().readyState() >= HAVE_CURRENT_DATA || this.isPlayOnMobile && this.player().hasClass("vjs-playing"))) {
                    var ct = new Date().getTime();
                    if (ct - this.time >= 30) {
                        this.texture.needsUpdate = true;
                        this.time = ct;
                    }
                    if (this.isPlayOnMobile) {
                        var currentTime = this.player().currentTime();
                        if (_MobileBuffering2.default.isBuffering(currentTime)) {
                            if (!this.player().hasClass("vjs-panorama-mobile-inline-video-buffering")) {
                                this.player().addClass("vjs-panorama-mobile-inline-video-buffering");
                            }
                        } else {
                            if (this.player().hasClass("vjs-panorama-mobile-inline-video-buffering")) {
                                this.player().removeClass("vjs-panorama-mobile-inline-video-buffering");
                            }
                        }
                    }
                }
            }
            this.render();
        },

        render: function render() {
            if (!this.isUserInteracting) {
                var symbolLat = this.lat > this.settings.initLat ? -1 : 1;
                var symbolLon = this.lon > this.settings.initLon ? -1 : 1;
                if (this.settings.backToVerticalCenter) {
                    this.lat = this.lat > this.settings.initLat - Math.abs(this.settings.returnStepLat) && this.lat < this.settings.initLat + Math.abs(this.settings.returnStepLat) ? this.settings.initLat : this.lat + this.settings.returnStepLat * symbolLat;
                }
                if (this.settings.backToHorizonCenter) {
                    this.lon = this.lon > this.settings.initLon - Math.abs(this.settings.returnStepLon) && this.lon < this.settings.initLon + Math.abs(this.settings.returnStepLon) ? this.settings.initLon : this.lon + this.settings.returnStepLon * symbolLon;
                }
            }
            this.lat = Math.max(this.settings.minLat, Math.min(this.settings.maxLat, this.lat));
            this.lon = Math.max(this.settings.minLon, Math.min(this.settings.maxLon, this.lon));
            this.phi = THREE.Math.degToRad(90 - this.lat);
            this.theta = THREE.Math.degToRad(this.lon);

            if (!this.supportVideoTexture) {
                this.helperCanvas.update();
            }
            this.renderer.clear();
        },

        playOnMobile: function playOnMobile() {
            this.isPlayOnMobile = true;
            if (this.settings.autoMobileOrientation) window.addEventListener('devicemotion', this.handleMobileOrientation.bind(this));
        },

        el: function el() {
            return this.el_;
        }
    };
};

exports.default = BaseCanvas;

},{"../lib/Detector":6,"../lib/MobileBuffering":8,"../lib/Util":11}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _BaseCanvas = require('./BaseCanvas');

var _BaseCanvas2 = _interopRequireDefault(_BaseCanvas);

var _Util = require('./Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Created by yanwsh on 4/3/16.
 */

var Canvas = function Canvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    var parent = (0, _BaseCanvas2.default)(baseComponent, THREE, settings);

    return _Util2.default.extend(parent, {
        constructor: function init(player, options) {
            parent.constructor.call(this, player, options);

            this.VRMode = false;
            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.camera = new THREE.PerspectiveCamera(options.initFov, this.width / this.height, 1, 2000);
            this.camera.target = new THREE.Vector3(0, 0, 0);

            //define geometry
            var geometry = this.videoType === "equirectangular" ? new THREE.SphereGeometry(500, 60, 40) : new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
            if (this.videoType === "fisheye") {
                var normals = geometry.attributes.normal.array;
                var uvs = geometry.attributes.uv.array;
                for (var i = 0, l = normals.length / 3; i < l; i++) {
                    var x = normals[i * 3 + 0];
                    var y = normals[i * 3 + 1];
                    var z = normals[i * 3 + 2];

                    var r = Math.asin(Math.sqrt(x * x + z * z) / Math.sqrt(x * x + y * y + z * z)) / Math.PI;
                    if (y < 0) r = 1 - r;
                    var theta = x == 0 && z == 0 ? 0 : Math.acos(x / Math.sqrt(x * x + z * z));
                    if (z < 0) theta = theta * -1;
                    uvs[i * 2 + 0] = -0.8 * r * Math.cos(theta) + 0.5;
                    uvs[i * 2 + 1] = 0.8 * r * Math.sin(theta) + 0.5;
                }
                geometry.rotateX(options.rotateX);
                geometry.rotateY(options.rotateY);
                geometry.rotateZ(options.rotateZ);
            } else if (this.videoType === "dual_fisheye") {
                var _normals = geometry.attributes.normal.array;
                var _uvs = geometry.attributes.uv.array;
                var _l = _normals.length / 3;
                for (var _i = 0; _i < _l / 2; _i++) {
                    var _x2 = _normals[_i * 3 + 0];
                    var _y = _normals[_i * 3 + 1];
                    var _z = _normals[_i * 3 + 2];

                    var _r = _x2 == 0 && _z == 0 ? 1 : Math.acos(_y) / Math.sqrt(_x2 * _x2 + _z * _z) * (2 / Math.PI);
                    _uvs[_i * 2 + 0] = _x2 * options.dualFish.circle1.rx * _r * options.dualFish.circle1.coverX + options.dualFish.circle1.x;
                    _uvs[_i * 2 + 1] = _z * options.dualFish.circle1.ry * _r * options.dualFish.circle1.coverY + options.dualFish.circle1.y;
                }
                for (var _i2 = _l / 2; _i2 < _l; _i2++) {
                    var _x3 = _normals[_i2 * 3 + 0];
                    var _y2 = _normals[_i2 * 3 + 1];
                    var _z2 = _normals[_i2 * 3 + 2];

                    var _r2 = _x3 == 0 && _z2 == 0 ? 1 : Math.acos(-_y2) / Math.sqrt(_x3 * _x3 + _z2 * _z2) * (2 / Math.PI);
                    _uvs[_i2 * 2 + 0] = -_x3 * options.dualFish.circle2.rx * _r2 * options.dualFish.circle2.coverX + options.dualFish.circle2.x;
                    _uvs[_i2 * 2 + 1] = _z2 * options.dualFish.circle2.ry * _r2 * options.dualFish.circle2.coverY + options.dualFish.circle2.y;
                }
                geometry.rotateX(options.rotateX);
                geometry.rotateY(options.rotateY);
                geometry.rotateZ(options.rotateZ);
            }
            geometry.scale(-1, 1, 1);
            //define mesh
            this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture }));
            //this.mesh.scale.x = -1;
            this.scene.add(this.mesh);
        },

        enableVR: function enableVR() {
            this.VRMode = true;
            if (typeof vrHMD !== 'undefined') {
                var eyeParamsL = vrHMD.getEyeParameters('left');
                var eyeParamsR = vrHMD.getEyeParameters('right');

                this.eyeFOVL = eyeParamsL.recommendedFieldOfView;
                this.eyeFOVR = eyeParamsR.recommendedFieldOfView;
            }

            this.cameraL = new THREE.PerspectiveCamera(this.camera.fov, this.width / 2 / this.height, 1, 2000);
            this.cameraR = new THREE.PerspectiveCamera(this.camera.fov, this.width / 2 / this.height, 1, 2000);
        },

        disableVR: function disableVR() {
            this.VRMode = false;
            this.renderer.setViewport(0, 0, this.width, this.height);
            this.renderer.setScissor(0, 0, this.width, this.height);
        },

        handleResize: function handleResize() {
            parent.handleResize.call(this);
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraL.aspect = this.camera.aspect / 2;
                this.cameraR.aspect = this.camera.aspect / 2;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            parent.handleMouseWheel(event);
            // WebKit
            if (event.wheelDeltaY) {
                this.camera.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if (event.wheelDelta) {
                this.camera.fov -= event.wheelDelta * 0.05;
                // Firefox
            } else if (event.detail) {
                this.camera.fov += event.detail * 1.0;
            }
            this.camera.fov = Math.min(this.settings.maxFov, this.camera.fov);
            this.camera.fov = Math.max(this.settings.minFov, this.camera.fov);
            this.camera.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraL.fov = this.camera.fov;
                this.cameraR.fov = this.camera.fov;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleTouchMove: function handleTouchMove(event) {
            parent.handleTouchMove.call(this, event);
            if (this.isUserPinch) {
                var currentDistance = _Util2.default.getTouchesDistance(event.touches);
                event.wheelDeltaY = (currentDistance - this.multiTouchDistance) * 2;
                this.handleMouseWheel.call(this, event);
                this.multiTouchDistance = currentDistance;
            }
        },

        render: function render() {
            parent.render.call(this);
            this.camera.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
            this.camera.target.y = 500 * Math.cos(this.phi);
            this.camera.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
            this.camera.lookAt(this.camera.target);

            if (!this.VRMode) {
                this.renderer.render(this.scene, this.camera);
            } else {
                var viewPortWidth = this.width / 2,
                    viewPortHeight = this.height;
                if (typeof vrHMD !== 'undefined') {
                    this.cameraL.projectionMatrix = _Util2.default.fovToProjection(this.eyeFOVL, true, this.camera.near, this.camera.far);
                    this.cameraR.projectionMatrix = _Util2.default.fovToProjection(this.eyeFOVR, true, this.camera.near, this.camera.far);
                } else {
                    var lonL = this.lon + this.settings.VRGapDegree;
                    var lonR = this.lon - this.settings.VRGapDegree;

                    var thetaL = THREE.Math.degToRad(lonL);
                    var thetaR = THREE.Math.degToRad(lonR);

                    var targetL = _Util2.default.deepCopy(this.camera.target);
                    targetL.x = 500 * Math.sin(this.phi) * Math.cos(thetaL);
                    targetL.z = 500 * Math.sin(this.phi) * Math.sin(thetaL);
                    this.cameraL.lookAt(targetL);

                    var targetR = _Util2.default.deepCopy(this.camera.target);
                    targetR.x = 500 * Math.sin(this.phi) * Math.cos(thetaR);
                    targetR.z = 500 * Math.sin(this.phi) * Math.sin(thetaR);
                    this.cameraR.lookAt(targetR);
                }
                // render left eye
                this.renderer.setViewport(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraL);

                // render right eye
                this.renderer.setViewport(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraR);
            }
        }
    });
};

exports.default = Canvas;

},{"./BaseCanvas":4,"./Util":11}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * @author alteredq / http://alteredqualia.com/
 * @author mr.doob / http://mrdoob.com/
 */

var Detector = {

    canvas: !!window.CanvasRenderingContext2D,
    webgl: function () {

        try {

            var canvas = document.createElement('canvas');return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {

            return false;
        }
    }(),
    workers: !!window.Worker,
    fileapi: window.File && window.FileReader && window.FileList && window.Blob,

    Check_Version: function Check_Version() {
        var rv = -1; // Return value assumes failure.

        if (navigator.appName == 'Microsoft Internet Explorer') {

            var ua = navigator.userAgent,
                re = new RegExp("MSIE ([0-9]{1,}[\\.0-9]{0,})");

            if (re.exec(ua) !== null) {
                rv = parseFloat(RegExp.$1);
            }
        } else if (navigator.appName == "Netscape") {
            /// in IE 11 the navigator.appVersion says 'trident'
            /// in Edge the navigator.appVersion does not say trident
            if (navigator.appVersion.indexOf('Trident') !== -1) rv = 11;else {
                var ua = navigator.userAgent;
                var re = new RegExp("Edge\/([0-9]{1,}[\\.0-9]{0,})");
                if (re.exec(ua) !== null) {
                    rv = parseFloat(RegExp.$1);
                }
            }
        }

        return rv;
    },

    supportVideoTexture: function supportVideoTexture() {
        //ie 11 and edge 12 doesn't support video texture.
        var version = this.Check_Version();
        return version === -1 || version >= 13;
    },

    isLiveStreamOnSafari: function isLiveStreamOnSafari(videoElement) {
        //live stream on safari doesn't support video texture
        var videoSources = videoElement.querySelectorAll("source");
        var result = false;
        for (var i = 0; i < videoSources.length; i++) {
            var currentVideoSource = videoSources[i];
            if ((currentVideoSource.type == "application/x-mpegURL" || currentVideoSource.type == "application/vnd.apple.mpegurl") && /(Safari|AppleWebKit)/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor)) {
                result = true;
            }
            break;
        }
        return result;
    },

    getWebGLErrorMessage: function getWebGLErrorMessage() {

        var element = document.createElement('div');
        element.id = 'webgl-error-message';

        if (!this.webgl) {

            element.innerHTML = window.WebGLRenderingContext ? ['Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />', 'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'].join('\n') : ['Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>', 'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'].join('\n');
        }

        return element;
    },

    addGetWebGLMessage: function addGetWebGLMessage(parameters) {

        var parent, id, element;

        parameters = parameters || {};

        parent = parameters.parent !== undefined ? parameters.parent : document.body;
        id = parameters.id !== undefined ? parameters.id : 'oldie';

        element = Detector.getWebGLErrorMessage();
        element.id = id;

        parent.appendChild(element);
    }

};

exports.default = Detector;

},{}],7:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by wensheng.yan on 5/23/16.
 */
var element = document.createElement('canvas');
element.className = "vjs-video-helper-canvas";

var HelperCanvas = function HelperCanvas(baseComponent) {
    return {
        constructor: function init(player, options) {
            this.videoElement = options.video;
            this.width = options.width;
            this.height = options.height;

            element.width = this.width;
            element.height = this.height;
            element.style.display = "none";
            options.el = element;

            this.context = element.getContext('2d');
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
            baseComponent.call(this, player, options);
        },

        getContext: function getContext() {
            return this.context;
        },

        update: function update() {
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
        },

        el: function el() {
            return element;
        }
    };
};

exports.default = HelperCanvas;

},{}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by yanwsh on 6/6/16.
 */
var MobileBuffering = {
    prev_currentTime: 0,
    counter: 0,

    isBuffering: function isBuffering(currentTime) {
        if (currentTime == this.prev_currentTime) this.counter++;else this.counter = 0;
        this.prev_currentTime = currentTime;
        if (this.counter > 10) {
            //not let counter overflow
            this.counter = 10;
            return true;
        }
        return false;
    }
};

exports.default = MobileBuffering;

},{}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
 * Created by yanwsh on 4/4/16.
 */

var Notice = function Notice(baseComponent) {
    var element = document.createElement('div');
    element.className = "vjs-video-notice-label";

    return {
        constructor: function init(player, options) {
            if (_typeof(options.NoticeMessage) == "object") {
                element = options.NoticeMessage;
                options.el = options.NoticeMessage;
            } else if (typeof options.NoticeMessage == "string") {
                element.innerHTML = options.NoticeMessage;
                options.el = element;
            }

            baseComponent.call(this, player, options);
        },

        el: function el() {
            return element;
        }
    };
};

exports.default = Notice;

},{}],10:[function(require,module,exports){
/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/21/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _BaseCanvas = require('./BaseCanvas');

var _BaseCanvas2 = _interopRequireDefault(_BaseCanvas);

var _Util = require('./Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ThreeDCanvas = function ThreeDCanvas(baseComponent, THREE) {
    var settings = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    var parent = (0, _BaseCanvas2.default)(baseComponent, THREE, settings);
    return _Util2.default.extend(parent, {
        constructor: function init(player, options) {
            parent.constructor.call(this, player, options);
            //only show left part by default
            this.VRMode = false;
            //define scene
            this.scene = new THREE.Scene();

            var aspectRatio = this.width / this.height;
            //define camera
            this.cameraL = new THREE.PerspectiveCamera(options.initFov, aspectRatio, 1, 2000);
            this.cameraL.target = new THREE.Vector3(0, 0, 0);

            this.cameraR = new THREE.PerspectiveCamera(options.initFov, aspectRatio / 2, 1, 2000);
            this.cameraR.position.set(1000, 0, 0);
            this.cameraR.target = new THREE.Vector3(1000, 0, 0);

            var geometryL = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
            var geometryR = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();

            var uvsL = geometryL.attributes.uv.array;
            var normalsL = geometryL.attributes.normal.array;
            for (var i = 0; i < normalsL.length / 3; i++) {
                uvsL[i * 2 + 1] = uvsL[i * 2 + 1] / 2;
            }

            var uvsR = geometryR.attributes.uv.array;
            var normalsR = geometryR.attributes.normal.array;
            for (var i = 0; i < normalsR.length / 3; i++) {
                uvsR[i * 2 + 1] = uvsR[i * 2 + 1] / 2 + 0.5;
            }

            geometryL.scale(-1, 1, 1);
            geometryR.scale(-1, 1, 1);

            this.meshL = new THREE.Mesh(geometryL, new THREE.MeshBasicMaterial({ map: this.texture }));

            this.meshR = new THREE.Mesh(geometryR, new THREE.MeshBasicMaterial({ map: this.texture }));
            this.meshR.position.set(1000, 0, 0);

            this.scene.add(this.meshL);

            if (options.callback) options.callback();
        },

        handleResize: function handleResize() {
            parent.handleResize.call(this);
            var aspectRatio = this.width / this.height;
            if (!this.VRMode) {
                this.cameraL.aspect = aspectRatio;
                this.cameraL.updateProjectionMatrix();
            } else {
                aspectRatio /= 2;
                this.cameraL.aspect = aspectRatio;
                this.cameraR.aspect = aspectRatio;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleMouseWheel: function handleMouseWheel(event) {
            parent.handleMouseWheel(event);
            // WebKit
            if (event.wheelDeltaY) {
                this.cameraL.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if (event.wheelDelta) {
                this.cameraL.fov -= event.wheelDelta * 0.05;
                // Firefox
            } else if (event.detail) {
                this.cameraL.fov += event.detail * 1.0;
            }
            this.cameraL.fov = Math.min(this.settings.maxFov, this.cameraL.fov);
            this.cameraL.fov = Math.max(this.settings.minFov, this.cameraL.fov);
            this.cameraL.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraR.fov = this.cameraL.fov;
                this.cameraR.updateProjectionMatrix();
            }
        },

        enableVR: function enableVR() {
            this.VRMode = true;
            this.scene.add(this.meshR);
            this.handleResize();
        },

        disableVR: function disableVR() {
            this.VRMode = false;
            this.scene.remove(this.meshR);
            this.handleResize();
        },

        render: function render() {
            parent.render.call(this);
            this.cameraL.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
            this.cameraL.target.y = 500 * Math.cos(this.phi);
            this.cameraL.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
            this.cameraL.lookAt(this.cameraL.target);

            if (this.VRMode) {
                var viewPortWidth = this.width / 2,
                    viewPortHeight = this.height;
                this.cameraR.target.x = 1000 + 500 * Math.sin(this.phi) * Math.cos(this.theta);
                this.cameraR.target.y = 500 * Math.cos(this.phi);
                this.cameraR.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
                this.cameraR.lookAt(this.cameraR.target);

                // render left eye
                this.renderer.setViewport(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(0, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraL);

                // render right eye
                this.renderer.setViewport(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.setScissor(viewPortWidth, 0, viewPortWidth, viewPortHeight);
                this.renderer.render(this.scene, this.cameraR);
            } else {
                this.renderer.render(this.scene, this.cameraL);
            }
        }
    });
};

exports.default = ThreeDCanvas;

},{"./BaseCanvas":4,"./Util":11}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by wensheng.yan on 4/4/16.
 */
function whichTransitionEvent() {
    var t;
    var el = document.createElement('fakeelement');
    var transitions = {
        'transition': 'transitionend',
        'OTransition': 'oTransitionEnd',
        'MozTransition': 'transitionend',
        'WebkitTransition': 'webkitTransitionEnd'
    };

    for (t in transitions) {
        if (el.style[t] !== undefined) {
            return transitions[t];
        }
    }
}

function mobileAndTabletcheck() {
    var check = false;
    (function (a) {
        if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true;
    })(navigator.userAgent || navigator.vendor || window.opera);
    return check;
}

function isIos() {
    return (/iPhone|iPad|iPod/i.test(navigator.userAgent)
    );
}

function isRealIphone() {
    return (/iPhone|iPod/i.test(navigator.platform)
    );
}

//adopt code from: https://github.com/MozVR/vr-web-examples/blob/master/threejs-vr-boilerplate/js/VREffect.js
function fovToNDCScaleOffset(fov) {
    var pxscale = 2.0 / (fov.leftTan + fov.rightTan);
    var pxoffset = (fov.leftTan - fov.rightTan) * pxscale * 0.5;
    var pyscale = 2.0 / (fov.upTan + fov.downTan);
    var pyoffset = (fov.upTan - fov.downTan) * pyscale * 0.5;
    return { scale: [pxscale, pyscale], offset: [pxoffset, pyoffset] };
}

function fovPortToProjection(fov, rightHanded, zNear, zFar) {

    rightHanded = rightHanded === undefined ? true : rightHanded;
    zNear = zNear === undefined ? 0.01 : zNear;
    zFar = zFar === undefined ? 10000.0 : zFar;

    var handednessScale = rightHanded ? -1.0 : 1.0;

    // start with an identity matrix
    var mobj = new THREE.Matrix4();
    var m = mobj.elements;

    // and with scale/offset info for normalized device coords
    var scaleAndOffset = fovToNDCScaleOffset(fov);

    // X result, map clip edges to [-w,+w]
    m[0 * 4 + 0] = scaleAndOffset.scale[0];
    m[0 * 4 + 1] = 0.0;
    m[0 * 4 + 2] = scaleAndOffset.offset[0] * handednessScale;
    m[0 * 4 + 3] = 0.0;

    // Y result, map clip edges to [-w,+w]
    // Y offset is negated because this proj matrix transforms from world coords with Y=up,
    // but the NDC scaling has Y=down (thanks D3D?)
    m[1 * 4 + 0] = 0.0;
    m[1 * 4 + 1] = scaleAndOffset.scale[1];
    m[1 * 4 + 2] = -scaleAndOffset.offset[1] * handednessScale;
    m[1 * 4 + 3] = 0.0;

    // Z result (up to the app)
    m[2 * 4 + 0] = 0.0;
    m[2 * 4 + 1] = 0.0;
    m[2 * 4 + 2] = zFar / (zNear - zFar) * -handednessScale;
    m[2 * 4 + 3] = zFar * zNear / (zNear - zFar);

    // W result (= Z in)
    m[3 * 4 + 0] = 0.0;
    m[3 * 4 + 1] = 0.0;
    m[3 * 4 + 2] = handednessScale;
    m[3 * 4 + 3] = 0.0;

    mobj.transpose();

    return mobj;
}

function fovToProjection(fov, rightHanded, zNear, zFar) {
    var DEG2RAD = Math.PI / 180.0;

    var fovPort = {
        upTan: Math.tan(fov.upDegrees * DEG2RAD),
        downTan: Math.tan(fov.downDegrees * DEG2RAD),
        leftTan: Math.tan(fov.leftDegrees * DEG2RAD),
        rightTan: Math.tan(fov.rightDegrees * DEG2RAD)
    };

    return fovPortToProjection(fovPort, rightHanded, zNear, zFar);
}

function extend(superClass) {
    var subClassMethods = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    for (var method in superClass) {
        if (superClass.hasOwnProperty(method) && !subClassMethods.hasOwnProperty(method)) {
            subClassMethods[method] = superClass[method];
        }
    }
    return subClassMethods;
}

function deepCopy(obj) {
    var to = {};

    for (var name in obj) {
        to[name] = obj[name];
    }

    return to;
}

function getTouchesDistance(touches) {
    return Math.sqrt((touches[0].clientX - touches[1].clientX) * (touches[0].clientX - touches[1].clientX) + (touches[0].clientY - touches[1].clientY) * (touches[0].clientY - touches[1].clientY));
}

exports.default = {
    whichTransitionEvent: whichTransitionEvent,
    mobileAndTabletcheck: mobileAndTabletcheck,
    isIos: isIos,
    isRealIphone: isRealIphone,
    fovToProjection: fovToProjection,
    extend: extend,
    deepCopy: deepCopy,
    getTouchesDistance: getTouchesDistance
};

},{}],12:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
/**
 * Created by yanwsh on 8/13/16.
 */

var VRButton = function VRButton(ButtonComponent) {
    return {
        constructor: function init(player, options) {
            ButtonComponent.call(this, player, options);
        },

        buildCSSClass: function buildCSSClass() {
            return "vjs-VR-control " + ButtonComponent.prototype.buildCSSClass.call(this);
        },

        handleClick: function handleClick() {
            var canvas = this.player().getChild("Canvas");
            !canvas.VRMode ? canvas.enableVR() : canvas.disableVR();
            canvas.VRMode ? this.addClass("enable") : this.removeClass("enable");
            canvas.VRMode ? this.player().trigger('VRModeOn') : this.player().trigger('VRModeOff');
        },

        controlText_: "VR"
    };
};

exports.default = VRButton;

},{}],13:[function(require,module,exports){
/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _Util = require('./lib/Util');

var _Util2 = _interopRequireDefault(_Util);

var _Detector = require('./lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _iphoneInlineVideo = require('iphone-inline-video');

var _iphoneInlineVideo2 = _interopRequireDefault(_iphoneInlineVideo);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var runOnMobile = _Util2.default.mobileAndTabletcheck();

// Default options for the plugin.
var defaults = {
    clickAndDrag: runOnMobile,
    showNotice: true,
    NoticeMessage: "Please use your mouse drag and drop the video.",
    autoHideNotice: 3000,
    //limit the video size when user scroll.
    scrollable: true,
    initFov: 75,
    maxFov: 105,
    minFov: 51,
    //initial position for the video
    initLat: 0,
    initLon: -180,
    //A float value back to center when mouse out the canvas. The higher, the faster.
    returnStepLat: 0.5,
    returnStepLon: 2,
    backToVerticalCenter: !runOnMobile,
    backToHorizonCenter: !runOnMobile,
    clickToToggle: false,

    //limit viewable zoom
    minLat: -85,
    maxLat: 85,

    minLon: -Infinity,
    maxLon: Infinity,

    videoType: "equirectangular",

    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,

    autoMobileOrientation: false,
    mobileVibrationValue: _Util2.default.isIos() ? 0.022 : 1,

    VREnable: true,
    VRGapDegree: 2.5,

    closePanorama: false,

    helperCanvas: {},

    dualFish: {
        width: 1920,
        height: 1080,
        circle1: {
            x: 0.240625,
            y: 0.553704,
            rx: 0.23333,
            ry: 0.43148,
            coverX: 0.913,
            coverY: 0.9
        },
        circle2: {
            x: 0.757292,
            y: 0.553704,
            rx: 0.232292,
            ry: 0.4296296,
            coverX: 0.913,
            coverY: 0.9308
        }
    }
};

function playerResize(player) {
    var canvas = player.getChild('Canvas');
    return function () {
        player.el().style.width = window.innerWidth + "px";
        player.el().style.height = window.innerHeight + "px";
        canvas.handleResize();
    };
}

function fullscreenOnIOS(player, clickFn) {
    var resizeFn = playerResize(player);
    player.controlBar.fullscreenToggle.off("tap", clickFn);
    player.controlBar.fullscreenToggle.on("tap", function fullscreen() {
        var canvas = player.getChild('Canvas');
        if (!player.isFullscreen()) {
            //set to fullscreen
            player.isFullscreen(true);
            player.enterFullWindow();
            resizeFn();
            window.addEventListener("devicemotion", resizeFn);
        } else {
            player.isFullscreen(false);
            player.exitFullWindow();
            player.el().style.width = "";
            player.el().style.height = "";
            canvas.handleResize();
            window.removeEventListener("devicemotion", resizeFn);
        }
    });
}

/**
 * Function to invoke when the player is ready.
 *
 * This is a great place for your plugin to initialize itself. When this
 * function is called, the player will have its DOM and child components
 * in place.
 *
 * @function onPlayerReady
 * @param    {Player} player
 * @param    {Object} [options={}]
 */
var onPlayerReady = function onPlayerReady(player, options, settings) {
    player.addClass('vjs-panorama');
    if (!_Detector2.default.webgl) {
        PopupNotification(player, {
            NoticeMessage: _Detector2.default.getWebGLErrorMessage(),
            autoHideNotice: options.autoHideNotice
        });
        if (options.callback) {
            options.callback();
        }
        return;
    }
    player.addChild('Canvas', _Util2.default.deepCopy(options));
    var canvas = player.getChild('Canvas');
    if (runOnMobile) {
        var videoElement = settings.getTech(player);
        if (_Util2.default.isRealIphone()) {
            //ios 10 support play video inline
            videoElement.setAttribute("playsinline", "");
            (0, _iphoneInlineVideo2.default)(videoElement, true);
        }
        if (_Util2.default.isIos()) {
            fullscreenOnIOS(player, settings.getFullscreenToggleClickFn(player));
        }
        player.addClass("vjs-panorama-mobile-inline-video");
        player.removeClass("vjs-using-native-controls");
        canvas.playOnMobile();
    }
    if (options.showNotice) {
        player.on("playing", function () {
            PopupNotification(player, _Util2.default.deepCopy(options));
        });
    }
    if (options.VREnable) {
        player.controlBar.addChild('VRButton', {}, player.controlBar.children().length - 1);
    }
    canvas.hide();
    player.on("play", function () {
        canvas.show();
    });
    player.on("fullscreenchange", function () {
        canvas.handleResize();
    });
    if (options.callback) options.callback();
};

var PopupNotification = function PopupNotification(player) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
        NoticeMessage: ""
    };

    var notice = player.addChild('Notice', options);

    if (options.autoHideNotice > 0) {
        setTimeout(function () {
            notice.addClass("vjs-video-notice-fadeOut");
            var transitionEvent = _Util2.default.whichTransitionEvent();
            var hide = function hide() {
                notice.hide();
                notice.removeClass("vjs-video-notice-fadeOut");
                notice.off(transitionEvent, hide);
            };
            notice.on(transitionEvent, hide);
        }, options.autoHideNotice);
    }
};

var plugin = function plugin() {
    var settings = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    /**
     * A video.js plugin.
     *
     * In the plugin function, the value of `this` is a video.js `Player`
     * instance. You cannot rely on the player being in a "ready" state here,
     * depending on how the plugin is invoked. This may or may not be important
     * to you; if not, remove the wait for "ready"!
     *
     * @function panorama
     * @param    {Object} [options={}]
     *           An object of options left to the plugin author to define.
     */
    var videoTypes = ["equirectangular", "fisheye", "3dVideo", "dual_fisheye"];
    var panorama = function panorama(options) {
        var _this = this;

        if (settings.mergeOption) options = settings.mergeOption(defaults, options);
        if (typeof settings._init === "undefined" || typeof settings._init !== "function") {
            console.error("plugin must implement init function().");
            return;
        }
        if (videoTypes.indexOf(options.videoType) == -1) options.videoType = defaults.videoType;
        settings._init(options);
        /* implement callback function when videojs is ready */
        this.ready(function () {
            onPlayerReady(_this, options, settings);
        });
    };

    // Include the version number.
    panorama.VERSION = '0.1.5';

    return panorama;
};

exports.default = plugin;

},{"./lib/Detector":6,"./lib/Util":11,"iphone-inline-video":2}],14:[function(require,module,exports){
'use strict';

var _Canvas = require('./lib/Canvas');

var _Canvas2 = _interopRequireDefault(_Canvas);

var _ThreeCanvas = require('./lib/ThreeCanvas');

var _ThreeCanvas2 = _interopRequireDefault(_ThreeCanvas);

var _Notice = require('./lib/Notice');

var _Notice2 = _interopRequireDefault(_Notice);

var _HelperCanvas = require('./lib/HelperCanvas');

var _HelperCanvas2 = _interopRequireDefault(_HelperCanvas);

var _VRButton = require('./lib/VRButton');

var _VRButton2 = _interopRequireDefault(_VRButton);

var _plugin = require('./plugin');

var _plugin2 = _interopRequireDefault(_plugin);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getTech(player) {
    return player.tech({ IWillNotUseThisInPlugins: true }).el();
}

function getFullscreenToggleClickFn(player) {
    return player.controlBar.fullscreenToggle.handleClick;
}

var component = videojs.getComponent('Component');

var notice = (0, _Notice2.default)(component);
videojs.registerComponent('Notice', videojs.extend(component, notice));

var helperCanvas = (0, _HelperCanvas2.default)(component);
videojs.registerComponent('HelperCanvas', videojs.extend(component, helperCanvas));

var button = videojs.getComponent("Button");
var vrBtn = (0, _VRButton2.default)(button);
videojs.registerComponent('VRButton', videojs.extend(button, vrBtn));

// Register the plugin with video.js.
videojs.plugin('panorama', (0, _plugin2.default)({
    _init: function _init(options) {
        var canvas = options.videoType !== "3dVideo" ? (0, _Canvas2.default)(component, window.THREE, {
            getTech: getTech
        }) : (0, _ThreeCanvas2.default)(component, window.THREE, {
            getTech: getTech
        });
        videojs.registerComponent('Canvas', videojs.extend(component, canvas));
    },
    mergeOption: function mergeOption(defaults, options) {
        return videojs.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));

},{"./lib/Canvas":5,"./lib/HelperCanvas":7,"./lib/Notice":9,"./lib/ThreeCanvas":10,"./lib/VRButton":12,"./plugin":13}]},{},[14])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaW50ZXJ2YWxvbWV0ZXIvZGlzdC9pbnRlcnZhbG9tZXRlci5jb21tb24tanMuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwibm9kZV9tb2R1bGVzL3Bvb3ItbWFucy1zeW1ib2wvZGlzdC9wb29yLW1hbnMtc3ltYm9sLmNvbW1vbi1qcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9CYXNlQ2FudmFzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9UaHJlZUNhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvbGliL1ZSQnV0dG9uLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y1LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7Ozs7Ozs7O0FBUUE7Ozs7OztBQUVBOzs7O0FBQ0E7Ozs7QUFDQTs7Ozs7O0FBRUEsSUFBTSxvQkFBb0IsQ0FBMUI7O0FBRUEsSUFBSSxhQUFhLFNBQWIsVUFBYSxDQUFVLGFBQVYsRUFBeUIsS0FBekIsRUFBK0M7QUFBQSxRQUFmLFFBQWUsdUVBQUosRUFBSTs7QUFDNUQsV0FBTztBQUNILHFCQUFhLFNBQVMsSUFBVCxD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QVMsT0FkdUI7QUFlaEMsZ0NBQTRCO0FBZkksQ0FBVCxDQUEzQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiEgbnBtLmltL2ludGVydmFsb21ldGVyICovXG4ndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG5cbmZ1bmN0aW9uIGludGVydmFsb21ldGVyKGNiLCByZXF1ZXN0LCBjYW5jZWwsIHJlcXVlc3RQYXJhbWV0ZXIpIHtcblx0dmFyIHJlcXVlc3RJZDtcblx0dmFyIHByZXZpb3VzTG9vcFRpbWU7XG5cdGZ1bmN0aW9uIGxvb3Aobm93KSB7XG5cdFx0Ly8gbXVzdCBiZSByZXF1ZXN0ZWQgYmVmb3JlIGNiKCkgYmVjYXVzZSB0aGF0IG1pZ2h0IGNhbGwgLnN0b3AoKVxuXHRcdHJlcXVlc3RJZCA9IHJlcXVlc3QobG9vcCwgcmVxdWVzdFBhcmFtZXRlcik7XG5cblx0XHQvLyBjYWxsZWQgd2l0aCBcIm1zIHNpbmNlIGxhc3QgY2FsbFwiLiAwIG9uIHN0YXJ0KClcblx0XHRjYihub3cgLSAocHJldmlvdXNMb29wVGltZSB8fCBub3cpKTtcblxuXHRcdHByZXZpb3VzTG9vcFRpbWUgPSBub3c7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzdGFydDogZnVuY3Rpb24gc3RhcnQoKSB7XG5cdFx0XHRpZiAoIXJlcXVlc3RJZCkgeyAvLyBwcmV2ZW50IGRvdWJsZSBzdGFydHNcblx0XHRcdFx0bG9vcCgwKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHN0b3A6IGZ1bmN0aW9uIHN0b3AoKSB7XG5cdFx0XHRjYW5jZWwocmVxdWVzdElkKTtcblx0XHRcdHJlcXVlc3RJZCA9IG51bGw7XG5cdFx0XHRwcmV2aW91c0xvb3BUaW1lID0gMDtcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGZyYW1lSW50ZXJ2YWxvbWV0ZXIoY2IpIHtcblx0cmV0dXJuIGludGVydmFsb21ldGVyKGNiLCByZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIGNhbmNlbEFuaW1hdGlvbkZyYW1lKTtcbn1cblxuZnVuY3Rpb24gdGltZXJJbnRlcnZhbG9tZXRlcihjYiwgZGVsYXkpIHtcblx0cmV0dXJuIGludGVydmFsb21ldGVyKGNiLCBzZXRUaW1lb3V0LCBjbGVhclRpbWVvdXQsIGRlbGF5KTtcbn1cblxuZXhwb3J0cy5pbnRlcnZhbG9tZXRlciA9IGludGVydmFsb21ldGVyO1xuZXhwb3J0cy5mcmFtZUludGVydmFsb21ldGVyID0gZnJhbWVJbnRlcnZhbG9tZXRlcjtcbmV4cG9ydHMudGltZXJJbnRlcnZhbG9tZXRlciA9IHRpbWVySW50ZXJ2YWxvbWV0ZXI7IiwiLyohIG5wbS5pbS9pcGhvbmUtaW5saW5lLXZpZGVvICovXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wRGVmYXVsdCAoZXgpIHsgcmV0dXJuIChleCAmJiAodHlwZW9mIGV4ID09PSAnb2JqZWN0JykgJiYgJ2RlZmF1bHQnIGluIGV4KSA/IGV4WydkZWZhdWx0J10gOiBleDsgfVxuXG52YXIgU3ltYm9sID0gX2ludGVyb3BEZWZhdWx0KHJlcXVpcmUoJ3Bvb3ItbWFucy1zeW1ib2wnKSk7XG52YXIgaW50ZXJ2YWxvbWV0ZXIgPSByZXF1aXJlKCdpbnRlcnZhbG9tZXRlcicpO1xuXG5mdW5jdGlvbiBwcmV2ZW50RXZlbnQoZWxlbWVudCwgZXZlbnROYW1lLCB0b2dnbGVQcm9wZXJ0eSwgcHJldmVudFdpdGhQcm9wZXJ0eSkge1xuXHRmdW5jdGlvbiBoYW5kbGVyKGUpIHtcblx0XHRpZiAoQm9vbGVhbihlbGVtZW50W3RvZ2dsZVByb3BlcnR5XSkgPT09IEJvb2xlYW4ocHJldmVudFdpdGhQcm9wZXJ0eSkpIHtcblx0XHRcdGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHQvLyBjb25zb2xlLmxvZyhldmVudE5hbWUsICdwcmV2ZW50ZWQgb24nLCBlbGVtZW50KTtcblx0XHR9XG5cdFx0ZGVsZXRlIGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldO1xuXHR9XG5cdGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGhhbmRsZXIsIGZhbHNlKTtcblxuXHQvLyBSZXR1cm4gaGFuZGxlciB0byBhbGxvdyB0byBkaXNhYmxlIHRoZSBwcmV2ZW50aW9uLiBVc2FnZTpcblx0Ly8gY29uc3QgcHJldmVudGlvbkhhbmRsZXIgPSBwcmV2ZW50RXZlbnQoZWwsICdjbGljaycpO1xuXHQvLyBlbC5yZW1vdmVFdmVudEhhbmRsZXIoJ2NsaWNrJywgcHJldmVudGlvbkhhbmRsZXIpO1xuXHRyZXR1cm4gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcHJveHlQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwgc291cmNlT2JqZWN0LCBjb3B5Rmlyc3QpIHtcblx0ZnVuY3Rpb24gZ2V0KCkge1xuXHRcdHJldHVybiBzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXTtcblx0fVxuXHRmdW5jdGlvbiBzZXQodmFsdWUpIHtcblx0XHRzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXSA9IHZhbHVlO1xuXHR9XG5cblx0aWYgKGNvcHlGaXJzdCkge1xuXHRcdHNldChvYmplY3RbcHJvcGVydHlOYW1lXSk7XG5cdH1cblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHtnZXQ6IGdldCwgc2V0OiBzZXR9KTtcbn1cblxuZnVuY3Rpb24gcHJveHlFdmVudChvYmplY3QsIGV2ZW50TmFtZSwgc291cmNlT2JqZWN0KSB7XG5cdHNvdXJjZU9iamVjdC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gb2JqZWN0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KGV2ZW50TmFtZSkpOyB9KTtcbn1cblxuZnVuY3Rpb24gZGlzcGF0Y2hFdmVudEFzeW5jKGVsZW1lbnQsIHR5cGUpIHtcblx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0ZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCh0eXBlKSk7XG5cdH0pO1xufVxuXG4vLyBpT1MgMTAgYWRkcyBzdXBwb3J0IGZvciBuYXRpdmUgaW5saW5lIHBsYXliYWNrICsgc2lsZW50IGF1dG9wbGF5XG52YXIgaXNXaGl0ZWxpc3RlZCA9IC9pUGhvbmV8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkgJiYgIW1hdGNoTWVkaWEoJygtd2Via2l0LXZpZGVvLXBsYXlhYmxlLWlubGluZSknKS5tYXRjaGVzO1xuXG52YXIg4LKgID0gU3ltYm9sKCk7XG52YXIg4LKgZXZlbnQgPSBTeW1ib2woKTtcbnZhciDgsqBwbGF5ID0gU3ltYm9sKCduYXRpdmVwbGF5Jyk7XG52YXIg4LKgcGF1c2UgPSBTeW1ib2woJ25hdGl2ZXBhdXNlJyk7XG5cbi8qKlxuICogVVRJTFNcbiAqL1xuXG5mdW5jdGlvbiBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbykge1xuXHR2YXIgYXVkaW8gPSBuZXcgQXVkaW8oKTtcblx0cHJveHlFdmVudCh2aWRlbywgJ3BsYXknLCBhdWRpbyk7XG5cdHByb3h5RXZlbnQodmlkZW8sICdwbGF5aW5nJywgYXVkaW8pO1xuXHRwcm94eUV2ZW50KHZpZGVvLCAncGF1c2UnLCBhdWRpbyk7XG5cdGF1ZGlvLmNyb3NzT3JpZ2luID0gdmlkZW8uY3Jvc3NPcmlnaW47XG5cblx0Ly8gJ2RhdGE6JyBjYXVzZXMgYXVkaW8ubmV0d29ya1N0YXRlID4gMFxuXHQvLyB3aGljaCB0aGVuIGFsbG93cyB0byBrZWVwIDxhdWRpbz4gaW4gYSByZXN1bWFibGUgcGxheWluZyBzdGF0ZVxuXHQvLyBpLmUuIG9uY2UgeW91IHNldCBhIHJlYWwgc3JjIGl0IHdpbGwga2VlcCBwbGF5aW5nIGlmIGl0IHdhcyBpZiAucGxheSgpIHdhcyBjYWxsZWRcblx0YXVkaW8uc3JjID0gdmlkZW8uc3JjIHx8IHZpZGVvLmN1cnJlbnRTcmMgfHwgJ2RhdGE6JztcblxuXHQvLyBpZiAoYXVkaW8uc3JjID09PSAnZGF0YTonKSB7XG5cdC8vICAgVE9ETzogd2FpdCBmb3IgdmlkZW8gdG8gYmUgc2VsZWN0ZWRcblx0Ly8gfVxuXHRyZXR1cm4gYXVkaW87XG59XG5cbnZhciBsYXN0UmVxdWVzdHMgPSBbXTtcbnZhciByZXF1ZXN0SW5kZXggPSAwO1xudmFyIGxhc3RUaW1ldXBkYXRlRXZlbnQ7XG5cbmZ1bmN0aW9uIHNldFRpbWUodmlkZW8sIHRpbWUsIHJlbWVtYmVyT25seSkge1xuXHQvLyBhbGxvdyBvbmUgdGltZXVwZGF0ZSBldmVudCBldmVyeSAyMDArIG1zXG5cdGlmICgobGFzdFRpbWV1cGRhdGVFdmVudCB8fCAwKSArIDIwMCA8IERhdGUubm93KCkpIHtcblx0XHR2aWRlb1vgsqBldmVudF0gPSB0cnVlO1xuXHRcdGxhc3RUaW1ldXBkYXRlRXZlbnQgPSBEYXRlLm5vdygpO1xuXHR9XG5cdGlmICghcmVtZW1iZXJPbmx5KSB7XG5cdFx0dmlkZW8uY3VycmVudFRpbWUgPSB0aW1lO1xuXHR9XG5cdGxhc3RSZXF1ZXN0c1srK3JlcXVlc3RJbmRleCAlIDNdID0gdGltZSAqIDEwMCB8IDAgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIGlzUGxheWVyRW5kZWQocGxheWVyKSB7XG5cdHJldHVybiBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID49IHBsYXllci52aWRlby5kdXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gdXBkYXRlKHRpbWVEaWZmKSB7XG5cdHZhciBwbGF5ZXIgPSB0aGlzO1xuXHQvLyBjb25zb2xlLmxvZygndXBkYXRlJywgcGxheWVyLnZpZGVvLnJlYWR5U3RhdGUsIHBsYXllci52aWRlby5uZXR3b3JrU3RhdGUsIHBsYXllci5kcml2ZXIucmVhZHlTdGF0ZSwgcGxheWVyLmRyaXZlci5uZXR3b3JrU3RhdGUsIHBsYXllci5kcml2ZXIucGF1c2VkKTtcblx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0ZVVFVSRV9EQVRBKSB7XG5cdFx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSBwbGF5ZXIudmlkZW8uY3VycmVudFRpbWUgKyAoKHRpbWVEaWZmICogcGxheWVyLnZpZGVvLnBsYXliYWNrUmF0ZSkgLyAxMDAwKTtcblx0XHRcdGlmIChwbGF5ZXIudmlkZW8ubG9vcCAmJiBpc1BsYXllckVuZGVkKHBsYXllcikpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNldFRpbWUocGxheWVyLnZpZGVvLCBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lKTtcblx0fSBlbHNlIGlmIChwbGF5ZXIudmlkZW8ubmV0d29ya1N0YXRlID09PSBwbGF5ZXIudmlkZW8uTkVUV09SS19JRExFICYmICFwbGF5ZXIudmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0Ly8gdGhpcyBzaG91bGQgaGFwcGVuIHdoZW4gdGhlIHNvdXJjZSBpcyBhdmFpbGFibGUgYnV0OlxuXHRcdC8vIC0gaXQncyBwb3RlbnRpYWxseSBwbGF5aW5nICgucGF1c2VkID09PSBmYWxzZSlcblx0XHQvLyAtIGl0J3Mgbm90IHJlYWR5IHRvIHBsYXlcblx0XHQvLyAtIGl0J3Mgbm90IGxvYWRpbmdcblx0XHQvLyBJZiBpdCBoYXNBdWRpbywgdGhhdCB3aWxsIGJlIGxvYWRlZCBpbiB0aGUgJ2VtcHRpZWQnIGhhbmRsZXIgYmVsb3dcblx0XHRwbGF5ZXIudmlkZW8ubG9hZCgpO1xuXHRcdC8vIGNvbnNvbGUubG9nKCdXaWxsIGxvYWQnKTtcblx0fVxuXG5cdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci52aWRlby5jdXJyZW50VGltZSA9PT0gcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSwgJ1ZpZGVvIG5vdCB1cGRhdGluZyEnKTtcblxuXHRpZiAocGxheWVyLnZpZGVvLmVuZGVkKSB7XG5cdFx0ZGVsZXRlIHBsYXllci52aWRlb1vgsqBldmVudF07IC8vIGFsbG93IHRpbWV1cGRhdGUgZXZlbnRcblx0XHRwbGF5ZXIudmlkZW8ucGF1c2UodHJ1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBNRVRIT0RTXG4gKi9cblxuZnVuY3Rpb24gcGxheSgpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BsYXknKTtcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB1c2UgdGhlIG5hdGl2ZSBwbGF5ZXJcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAocGxheWVyLmRyaXZlci5zcmMgIT09ICdkYXRhOicgJiYgcGxheWVyLmRyaXZlci5zcmMgIT09IHZpZGVvLnNyYykge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdzcmMgY2hhbmdlZCBvbiBwbGF5JywgdmlkZW8uc3JjKTtcblx0XHRzZXRUaW1lKHZpZGVvLCAwLCB0cnVlKTtcblx0XHRwbGF5ZXIuZHJpdmVyLnNyYyA9IHZpZGVvLnNyYztcblx0fVxuXG5cdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHBsYXllci5wYXVzZWQgPSBmYWxzZTtcblxuXHRpZiAoIXZpZGVvLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdC8vIC5sb2FkKCkgY2F1c2VzIHRoZSBlbXB0aWVkIGV2ZW50XG5cdFx0Ly8gdGhlIGFsdGVybmF0aXZlIGlzIC5wbGF5KCkrLnBhdXNlKCkgYnV0IHRoYXQgdHJpZ2dlcnMgcGxheS9wYXVzZSBldmVudHMsIGV2ZW4gd29yc2Vcblx0XHQvLyBwb3NzaWJseSB0aGUgYWx0ZXJuYXRpdmUgaXMgcHJldmVudGluZyB0aGlzIGV2ZW50IG9ubHkgb25jZVxuXHRcdHZpZGVvLmxvYWQoKTtcblx0fVxuXG5cdHBsYXllci5kcml2ZXIucGxheSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdGFydCgpO1xuXG5cdGlmICghcGxheWVyLmhhc0F1ZGlvKSB7XG5cdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGxheScpO1xuXHRcdGlmIChwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSA+PSBwbGF5ZXIudmlkZW8uSEFWRV9FTk9VR0hfREFUQSkge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ29ucGxheScpO1xuXHRcdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGxheWluZycpO1xuXHRcdH1cblx0fVxufVxuZnVuY3Rpb24gcGF1c2UoZm9yY2VFdmVudHMpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BhdXNlJyk7XG5cdHZhciB2aWRlbyA9IHRoaXM7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXG5cdHBsYXllci5kcml2ZXIucGF1c2UoKTtcblx0cGxheWVyLnVwZGF0ZXIuc3RvcCgpO1xuXG5cdC8vIGlmIGl0J3MgZnVsbHNjcmVlbiwgdGhlIGRldmVsb3BlciB0aGUgbmF0aXZlIHBsYXllci5wYXVzZSgpXG5cdC8vIFRoaXMgaXMgYXQgdGhlIGVuZCBvZiBwYXVzZSgpIGJlY2F1c2UgaXQgYWxzb1xuXHQvLyBuZWVkcyB0byBtYWtlIHN1cmUgdGhhdCB0aGUgc2ltdWxhdGlvbiBpcyBwYXVzZWRcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGF1c2VdKCk7XG5cdH1cblxuXHRpZiAocGxheWVyLnBhdXNlZCAmJiAhZm9yY2VFdmVudHMpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwbGF5ZXIucGF1c2VkID0gdHJ1ZTtcblx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwYXVzZScpO1xuXHR9XG5cdGlmICh2aWRlby5lbmRlZCkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAnZW5kZWQnKTtcblx0fVxufVxuXG4vKipcbiAqIFNFVFVQXG4gKi9cblxuZnVuY3Rpb24gYWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXSA9IHt9O1xuXHRwbGF5ZXIucGF1c2VkID0gdHJ1ZTsgLy8gdHJhY2sgd2hldGhlciAncGF1c2UnIGV2ZW50cyBoYXZlIGJlZW4gZmlyZWRcblx0cGxheWVyLmhhc0F1ZGlvID0gaGFzQXVkaW87XG5cdHBsYXllci52aWRlbyA9IHZpZGVvO1xuXHRwbGF5ZXIudXBkYXRlciA9IGludGVydmFsb21ldGVyLmZyYW1lSW50ZXJ2YWxvbWV0ZXIodXBkYXRlLmJpbmQocGxheWVyKSk7XG5cblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0cGxheWVyLmRyaXZlciA9IGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKTtcblx0fSBlbHNlIHtcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ29uY2FucGxheScpO1xuXHRcdFx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5aW5nJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cGxheWVyLmRyaXZlciA9IHtcblx0XHRcdHNyYzogdmlkZW8uc3JjIHx8IHZpZGVvLmN1cnJlbnRTcmMgfHwgJ2RhdGE6Jyxcblx0XHRcdG11dGVkOiB0cnVlLFxuXHRcdFx0cGF1c2VkOiB0cnVlLFxuXHRcdFx0cGF1c2U6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdHBsYXk6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSBmYWxzZTtcblx0XHRcdFx0Ly8gbWVkaWEgYXV0b21hdGljYWxseSBnb2VzIHRvIDAgaWYgLnBsYXkoKSBpcyBjYWxsZWQgd2hlbiBpdCdzIGRvbmVcblx0XHRcdFx0aWYgKGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRcdHNldFRpbWUodmlkZW8sIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGVuZGVkKCkge1xuXHRcdFx0XHRyZXR1cm4gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyAubG9hZCgpIGNhdXNlcyB0aGUgZW1wdGllZCBldmVudFxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbXB0aWVkJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdkcml2ZXIgc3JjIGlzJywgcGxheWVyLmRyaXZlci5zcmMpO1xuXHRcdHZhciB3YXNFbXB0eSA9ICFwbGF5ZXIuZHJpdmVyLnNyYyB8fCBwbGF5ZXIuZHJpdmVyLnNyYyA9PT0gJ2RhdGE6Jztcblx0XHRpZiAocGxheWVyLmRyaXZlci5zcmMgJiYgcGxheWVyLmRyaXZlci5zcmMgIT09IHZpZGVvLnNyYykge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkIHRvJywgdmlkZW8uc3JjKTtcblx0XHRcdHNldFRpbWUodmlkZW8sIDAsIHRydWUpO1xuXHRcdFx0cGxheWVyLmRyaXZlci5zcmMgPSB2aWRlby5zcmM7XG5cdFx0XHQvLyBwbGF5aW5nIHZpZGVvcyB3aWxsIG9ubHkga2VlcCBwbGF5aW5nIGlmIG5vIHNyYyB3YXMgcHJlc2VudCB3aGVuIC5wbGF5KCnigJllZFxuXHRcdFx0aWYgKHdhc0VtcHR5KSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGxheSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGxheWVyLnVwZGF0ZXIuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSwgZmFsc2UpO1xuXG5cdC8vIHN0b3AgcHJvZ3JhbW1hdGljIHBsYXllciB3aGVuIE9TIHRha2VzIG92ZXJcblx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0YmVnaW5mdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdGhhdCB0aGUgPGF1ZGlvPiBhbmQgdGhlIHN5bmNlci91cGRhdGVyIGFyZSBzdG9wcGVkXG5cdFx0XHR2aWRlby5wYXVzZSgpO1xuXG5cdFx0XHQvLyBwbGF5IHZpZGVvIG5hdGl2ZWx5XG5cdFx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdH0gZWxzZSBpZiAoaGFzQXVkaW8gJiYgIXBsYXllci5kcml2ZXIuYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0XHQvLyBpZiB0aGUgZmlyc3QgcGxheSBpcyBuYXRpdmUsXG5cdFx0XHQvLyB0aGUgPGF1ZGlvPiBuZWVkcyB0byBiZSBidWZmZXJlZCBtYW51YWxseVxuXHRcdFx0Ly8gc28gd2hlbiB0aGUgZnVsbHNjcmVlbiBlbmRzLCBpdCBjYW4gYmUgc2V0IHRvIHRoZSBzYW1lIGN1cnJlbnQgdGltZVxuXHRcdFx0cGxheWVyLmRyaXZlci5sb2FkKCk7XG5cdFx0fVxuXHR9KTtcblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0ZW5kZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIHN5bmMgYXVkaW8gdG8gbmV3IHZpZGVvIHBvc2l0aW9uXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHQvLyBjb25zb2xlLmFzc2VydChwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID09PSB2aWRlby5jdXJyZW50VGltZSwgJ0F1ZGlvIG5vdCBzeW5jZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIGFsbG93IHNlZWtpbmdcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVraW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKGxhc3RSZXF1ZXN0cy5pbmRleE9mKHZpZGVvLmN1cnJlbnRUaW1lICogMTAwIHwgMCAvIDEwMCkgPCAwKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdVc2VyLXJlcXVlc3RlZCBzZWVraW5nJyk7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBvdmVybG9hZEFQSSh2aWRlbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblx0dmlkZW9b4LKgcGxheV0gPSB2aWRlby5wbGF5O1xuXHR2aWRlb1vgsqBwYXVzZV0gPSB2aWRlby5wYXVzZTtcblx0dmlkZW8ucGxheSA9IHBsYXk7XG5cdHZpZGVvLnBhdXNlID0gcGF1c2U7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwYXVzZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ211dGVkJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwbGF5YmFja1JhdGUnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2VuZGVkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdsb29wJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtpbmcnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2VkJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3RpbWV1cGRhdGUnLCDgsqBldmVudCwgZmFsc2UpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdlbmRlZCcsIOCyoGV2ZW50LCBmYWxzZSk7IC8vIHByZXZlbnQgb2NjYXNpb25hbCBuYXRpdmUgZW5kZWQgZXZlbnRzXG59XG5cbmZ1bmN0aW9uIGVuYWJsZUlubGluZVZpZGVvKHZpZGVvLCBoYXNBdWRpbywgb25seVdoaXRlbGlzdGVkKSB7XG5cdGlmICggaGFzQXVkaW8gPT09IHZvaWQgMCApIGhhc0F1ZGlvID0gdHJ1ZTtcblx0aWYgKCBvbmx5V2hpdGVsaXN0ZWQgPT09IHZvaWQgMCApIG9ubHlXaGl0ZWxpc3RlZCA9IHRydWU7XG5cblx0aWYgKChvbmx5V2hpdGVsaXN0ZWQgJiYgIWlzV2hpdGVsaXN0ZWQpIHx8IHZpZGVvW+CyoF0pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbyk7XG5cdG92ZXJsb2FkQVBJKHZpZGVvKTtcblx0dmlkZW8uY2xhc3NMaXN0LmFkZCgnSUlWJyk7XG5cdGlmICghaGFzQXVkaW8gJiYgdmlkZW8uYXV0b3BsYXkpIHtcblx0XHR2aWRlby5wbGF5KCk7XG5cdH1cblx0aWYgKCEvaVBob25lfGlQb2R8aVBhZC8udGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pKSB7XG5cdFx0Y29uc29sZS53YXJuKCdpcGhvbmUtaW5saW5lLXZpZGVvIGlzIG5vdCBndWFyYW50ZWVkIHRvIHdvcmsgaW4gZW11bGF0ZWQgZW52aXJvbm1lbnRzJyk7XG5cdH1cbn1cblxuZW5hYmxlSW5saW5lVmlkZW8uaXNXaGl0ZWxpc3RlZCA9IGlzV2hpdGVsaXN0ZWQ7XG5cbm1vZHVsZS5leHBvcnRzID0gZW5hYmxlSW5saW5lVmlkZW87IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgaW5kZXggPSB0eXBlb2YgU3ltYm9sID09PSAndW5kZWZpbmVkJyA/IGZ1bmN0aW9uIChkZXNjcmlwdGlvbikge1xuXHRyZXR1cm4gJ0AnICsgKGRlc2NyaXB0aW9uIHx8ICdAJykgKyBNYXRoLnJhbmRvbSgpO1xufSA6IFN5bWJvbDtcblxubW9kdWxlLmV4cG9ydHMgPSBpbmRleDsiLCIvKipcbiAqXG4gKiAoYykgV2Vuc2hlbmcgWWFuIDx5YW53c2hAZ21haWwuY29tPlxuICogRGF0ZTogMTAvMzAvMTZcbiAqXG4gKiBGb3IgdGhlIGZ1bGwgY29weXJpZ2h0IGFuZCBsaWNlbnNlIGluZm9ybWF0aW9uLCBwbGVhc2UgdmlldyB0aGUgTElDRU5TRVxuICogZmlsZSB0aGF0IHdhcyBkaXN0cmlidXRlZCB3aXRoIHRoaXMgc291cmNlIGNvZGUuXG4gKi9cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IERldGVjdG9yIGZyb20gJy4uL2xpYi9EZXRlY3Rvcic7XG5pbXBvcnQgTW9iaWxlQnVmZmVyaW5nIGZyb20gJy4uL2xpYi9Nb2JpbGVCdWZmZXJpbmcnO1xuaW1wb3J0IFV0aWwgZnJvbSAnLi4vbGliL1V0aWwnO1xuXG5jb25zdCBIQVZFX0NVUlJFTlRfREFUQSA9IDI7XG5cbnZhciBCYXNlQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBvcHRpb25zO1xuICAgICAgICAgICAgLy9iYXNpYyBzZXR0aW5nc1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHBsYXllci5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMubG9uID0gb3B0aW9ucy5pbml0TG9uLCB0aGlzLmxhdCA9IG9wdGlvbnMuaW5pdExhdCwgdGhpcy5waGkgPSAwLCB0aGlzLnRoZXRhID0gMDtcbiAgICAgICAgICAgIHRoaXMudmlkZW9UeXBlID0gb3B0aW9ucy52aWRlb1R5cGU7XG4gICAgICAgICAgICB0aGlzLmNsaWNrVG9Ub2dnbGUgPSBvcHRpb25zLmNsaWNrVG9Ub2dnbGU7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvL2RlZmluZSByZW5kZXJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmF1dG9DbGVhciA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDbGVhckNvbG9yKDB4MDAwMDAwLCAxKTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgdGV4dHVyZSwgb24gaWUgMTEsIHdlIG5lZWQgYWRkaXRpb25hbCBoZWxwZXIgY2FudmFzIHRvIHNvbHZlIHJlbmRlcmluZyBpc3N1ZS5cbiAgICAgICAgICAgIHZhciB2aWRlbyA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcbiAgICAgICAgICAgIHRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSA9IERldGVjdG9yLnN1cHBvcnRWaWRlb1RleHR1cmUoKTtcbiAgICAgICAgICAgIHRoaXMubGl2ZVN0cmVhbU9uU2FmYXJpID0gRGV0ZWN0b3IuaXNMaXZlU3RyZWFtT25TYWZhcmkodmlkZW8pO1xuICAgICAgICAgICAgaWYodGhpcy5saXZlU3RyZWFtT25TYWZhcmkpIHRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSA9IGZhbHNlO1xuICAgICAgICAgICAgaWYoIXRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oZWxwZXJDYW52YXMgPSBwbGF5ZXIuYWRkQ2hpbGQoXCJIZWxwZXJDYW52YXNcIiwge1xuICAgICAgICAgICAgICAgICAgICB2aWRlbzogdmlkZW8sXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiAob3B0aW9ucy5oZWxwZXJDYW52YXMud2lkdGgpPyBvcHRpb25zLmhlbHBlckNhbnZhcy53aWR0aDogdGhpcy53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiAob3B0aW9ucy5oZWxwZXJDYW52YXMuaGVpZ2h0KT8gb3B0aW9ucy5oZWxwZXJDYW52YXMuaGVpZ2h0OiB0aGlzLmhlaWdodFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZXh0ID0gdGhpcy5oZWxwZXJDYW52YXMuZWwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZShjb250ZXh0KTtcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKHZpZGVvKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmlkZW8uc3R5bGUudmlzaWJpbGl0eSA9IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUubWF4RmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcblxuICAgICAgICAgICAgdGhpcy5lbF8gPSB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmVsXy5jbGFzc0xpc3QuYWRkKCd2anMtdmlkZW8tY2FudmFzJyk7XG5cbiAgICAgICAgICAgIG9wdGlvbnMuZWwgPSB0aGlzLmVsXztcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB0aGlzLmF0dGFjaENvbnRyb2xFdmVudHMoKTtcbiAgICAgICAgICAgIHRoaXMucGxheWVyKCkub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGUoKTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXR0YWNoQ29udHJvbEV2ZW50czogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2htb3ZlJywgdGhpcy5oYW5kbGVUb3VjaE1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoc3RhcnQnLHRoaXMuaGFuZGxlVG91Y2hTdGFydC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNldXAnLCB0aGlzLmhhbmRsZU1vdXNlVXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaGVuZCcsIHRoaXMuaGFuZGxlVG91Y2hFbmQuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLnNjcm9sbGFibGUpe1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ21vdXNld2hlZWwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5vbignTW96TW91c2VQaXhlbFNjcm9sbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlZW50ZXInLCB0aGlzLmhhbmRsZU1vdXNlRW50ZXIuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWxlYXZlJywgdGhpcy5oYW5kbGVNb3VzZUxlYXNlLmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMucGxheWVyKCkuZWwoKS5vZmZzZXRXaWR0aCwgdGhpcy5oZWlnaHQgPSB0aGlzLnBsYXllcigpLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlVXA6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICBpZih0aGlzLmNsaWNrVG9Ub2dnbGUpe1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlggPSBNYXRoLmFicyhjbGllbnRYIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclgpO1xuICAgICAgICAgICAgICAgIHZhciBkaWZmWSA9IE1hdGguYWJzKGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSk7XG4gICAgICAgICAgICAgICAgaWYoZGlmZlggPCAwLjEgJiYgZGlmZlkgPCAwLjEpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkucGF1c2VkKCkgPyB0aGlzLnBsYXllcigpLnBsYXkoKSA6IHRoaXMucGxheWVyKCkucGF1c2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZURvd246IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICBpZih0eXBlb2YgY2xpZW50WCA9PT0gXCJ1bmRlZmluZWRcIiB8fCBjbGllbnRZID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCA9IGNsaWVudFg7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSA9IGNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Mb24gPSB0aGlzLmxvbjtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxhdCA9IHRoaXMubGF0O1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVRvdWNoU3RhcnQ6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGlmKGV2ZW50LnRvdWNoZXMubGVuZ3RoID4gMSl7XG4gICAgICAgICAgICAgICAgdGhpcy5pc1VzZXJQaW5jaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5tdWx0aVRvdWNoRGlzdGFuY2UgPSBVdGlsLmdldFRvdWNoZXNEaXN0YW5jZShldmVudC50b3VjaGVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTW91c2VEb3duKGV2ZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVUb3VjaEVuZDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJQaW5jaCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVNb3VzZVVwKGV2ZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZU1vdmU6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuY2xpY2tBbmREcmFnKXtcbiAgICAgICAgICAgICAgICBpZih0aGlzLm1vdXNlRG93bil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKCB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCAtIGNsaWVudFggKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxvbjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoIGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTGF0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHZhciB4ID0gZXZlbnQucGFnZVggLSB0aGlzLmVsXy5vZmZzZXRMZWZ0O1xuICAgICAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucGFnZVkgLSB0aGlzLmVsXy5vZmZzZXRUb3A7XG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoeCAvIHRoaXMud2lkdGgpICogNDMwIC0gMjI1O1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKHkgLyB0aGlzLmhlaWdodCkgKiAtMTgwICsgOTA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlVG91Y2hNb3ZlOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICAvL2hhbmRsZSBzaW5nbGUgdG91Y2ggZXZlbnQsXG4gICAgICAgICAgICBpZighdGhpcy5pc1VzZXJQaW5jaCB8fCBldmVudC50b3VjaGVzLmxlbmd0aCA8PSAxKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU1vdXNlTW92ZShldmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW9iaWxlT3JpZW50YXRpb246IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgaWYodHlwZW9mIGV2ZW50LnJvdGF0aW9uUmF0ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIHggPSBldmVudC5yb3RhdGlvblJhdGUuYWxwaGE7XG4gICAgICAgICAgICB2YXIgeSA9IGV2ZW50LnJvdGF0aW9uUmF0ZS5iZXRhO1xuICAgICAgICAgICAgdmFyIHBvcnRyYWl0ID0gKHR5cGVvZiBldmVudC5wb3J0cmFpdCAhPT0gXCJ1bmRlZmluZWRcIik/IGV2ZW50LnBvcnRyYWl0IDogd2luZG93Lm1hdGNoTWVkaWEoXCIob3JpZW50YXRpb246IHBvcnRyYWl0KVwiKS5tYXRjaGVzO1xuICAgICAgICAgICAgdmFyIGxhbmRzY2FwZSA9ICh0eXBlb2YgZXZlbnQubGFuZHNjYXBlICE9PSBcInVuZGVmaW5lZFwiKT8gZXZlbnQubGFuZHNjYXBlIDogd2luZG93Lm1hdGNoTWVkaWEoXCIob3JpZW50YXRpb246IGxhbmRzY2FwZSlcIikubWF0Y2hlcztcbiAgICAgICAgICAgIHZhciBvcmllbnRhdGlvbiA9IGV2ZW50Lm9yaWVudGF0aW9uIHx8IHdpbmRvdy5vcmllbnRhdGlvbjtcblxuICAgICAgICAgICAgaWYgKHBvcnRyYWl0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSB0aGlzLmxvbiAtIHkgKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gdGhpcy5sYXQgKyB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgIH1lbHNlIGlmKGxhbmRzY2FwZSl7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGF0aW9uRGVncmVlID0gLTkwO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiBvcmllbnRhdGlvbiAhPSBcInVuZGVmaW5lZFwiKXtcbiAgICAgICAgICAgICAgICAgICAgb3JpZW50YXRpb25EZWdyZWUgPSBvcmllbnRhdGlvbjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IChvcmllbnRhdGlvbkRlZ3JlZSA9PSAtOTApPyB0aGlzLmxvbiArIHggKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlIDogdGhpcy5sb24gLSB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IChvcmllbnRhdGlvbkRlZ3JlZSA9PSAtOTApPyB0aGlzLmxhdCArIHkgKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlIDogdGhpcy5sYXQgLSB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VFbnRlcjogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUxlYXNlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIGlmKHRoaXMubW91c2VEb3duKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBhbmltYXRlOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0QW5pbWF0aW9uSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoIHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpICk7XG4gICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIoKS5wYXVzZWQoKSl7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHRoaXMudGV4dHVyZSkgIT09IFwidW5kZWZpbmVkXCIgJiYgKCF0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyKCkucmVhZHlTdGF0ZSgpID49IEhBVkVfQ1VSUkVOVF9EQVRBIHx8IHRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wbGF5aW5nXCIpKSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3QgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN0IC0gdGhpcy50aW1lID49IDMwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lID0gY3Q7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5pc1BsYXlPbk1vYmlsZSl7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudFRpbWUgPSB0aGlzLnBsYXllcigpLmN1cnJlbnRUaW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihNb2JpbGVCdWZmZXJpbmcuaXNCdWZmZXJpbmcoY3VycmVudFRpbWUpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkuYWRkQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkucmVtb3ZlQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBpZighdGhpcy5pc1VzZXJJbnRlcmFjdGluZyl7XG4gICAgICAgICAgICAgICAgdmFyIHN5bWJvbExhdCA9ICh0aGlzLmxhdCA+IHRoaXMuc2V0dGluZ3MuaW5pdExhdCk/ICAtMSA6IDE7XG4gICAgICAgICAgICAgICAgdmFyIHN5bWJvbExvbiA9ICh0aGlzLmxvbiA+IHRoaXMuc2V0dGluZ3MuaW5pdExvbik/ICAtMSA6IDE7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5iYWNrVG9WZXJ0aWNhbENlbnRlcil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPiAodGhpcy5zZXR0aW5ncy5pbml0TGF0IC0gTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0KSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0IDwgKHRoaXMuc2V0dGluZ3MuaW5pdExhdCArIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCkpXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMuc2V0dGluZ3MuaW5pdExhdCA6IHRoaXMubGF0ICsgdGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0ICogc3ltYm9sTGF0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmJhY2tUb0hvcml6b25DZW50ZXIpe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IChcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID4gKHRoaXMuc2V0dGluZ3MuaW5pdExvbiAtIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbikpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA8ICh0aGlzLnNldHRpbmdzLmluaXRMb24gKyBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24pKVxuICAgICAgICAgICAgICAgICAgICApPyB0aGlzLnNldHRpbmdzLmluaXRMb24gOiB0aGlzLmxvbiArIHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbiAqIHN5bWJvbExvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmxhdCA9IE1hdGgubWF4KCB0aGlzLnNldHRpbmdzLm1pbkxhdCwgTWF0aC5taW4oIHRoaXMuc2V0dGluZ3MubWF4TGF0LCB0aGlzLmxhdCApICk7XG4gICAgICAgICAgICB0aGlzLmxvbiA9IE1hdGgubWF4KCB0aGlzLnNldHRpbmdzLm1pbkxvbiwgTWF0aC5taW4oIHRoaXMuc2V0dGluZ3MubWF4TG9uLCB0aGlzLmxvbiApICk7XG4gICAgICAgICAgICB0aGlzLnBoaSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIDkwIC0gdGhpcy5sYXQgKTtcbiAgICAgICAgICAgIHRoaXMudGhldGEgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCB0aGlzLmxvbiApO1xuXG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhlbHBlckNhbnZhcy51cGRhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuY2xlYXIoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBwbGF5T25Nb2JpbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaXNQbGF5T25Nb2JpbGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5hdXRvTW9iaWxlT3JpZW50YXRpb24pXG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZW1vdGlvbicsIHRoaXMuaGFuZGxlTW9iaWxlT3JpZW50YXRpb24uYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lbF87XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBCYXNlQ2FudmFzO1xuIiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzMvMTYuXG4gKi9cblxuaW1wb3J0IEJhc2VDYW52YXMgZnJvbSAnLi9CYXNlQ2FudmFzJztcbmltcG9ydCBVdGlsIGZyb20gJy4vVXRpbCc7XG5cbnZhciBDYW52YXMgPSBmdW5jdGlvbiAoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzID0ge30pIHtcbiAgICB2YXIgcGFyZW50ID0gQmFzZUNhbnZhcyhiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MpO1xuXG4gICAgcmV0dXJuIFV0aWwuZXh0ZW5kKHBhcmVudCwge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgcGFyZW50LmNvbnN0cnVjdG9yLmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vZGVmaW5lIHNjZW5lXG4gICAgICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG4gICAgICAgICAgICAvL2RlZmluZSBjYW1lcmFcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAwLCAwLCAwICk7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIGdlb21ldHJ5XG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnkgPSAodGhpcy52aWRlb1R5cGUgPT09IFwiZXF1aXJlY3Rhbmd1bGFyXCIpPyBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoNTAwLCA2MCwgNDApOiBuZXcgVEhSRUUuU3BoZXJlQnVmZmVyR2VvbWV0cnkoIDUwMCwgNjAsIDQwICkudG9Ob25JbmRleGVkKCk7XG4gICAgICAgICAgICBpZih0aGlzLnZpZGVvVHlwZSA9PT0gXCJmaXNoZXllXCIpe1xuICAgICAgICAgICAgICAgIGxldCBub3JtYWxzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICAgICAgbGV0IHV2cyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICAgICAgZm9yICggbGV0IGkgPSAwLCBsID0gbm9ybWFscy5sZW5ndGggLyAzOyBpIDwgbDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHggPSBub3JtYWxzWyBpICogMyArIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHkgPSBub3JtYWxzWyBpICogMyArIDEgXTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHogPSBub3JtYWxzWyBpICogMyArIDIgXTtcblxuICAgICAgICAgICAgICAgICAgICBsZXQgciA9IE1hdGguYXNpbihNYXRoLnNxcnQoeCAqIHggKyB6ICogeikgLyBNYXRoLnNxcnQoeCAqIHggICsgeSAqIHkgKyB6ICogeikpIC8gTWF0aC5QSTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeSA8IDApIHIgPSAxIC0gcjtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHRoZXRhID0gKHggPT0gMCAmJiB6ID09IDApPyAwIDogTWF0aC5hY29zKHggLyBNYXRoLnNxcnQoeCAqIHggKyB6ICogeikpO1xuICAgICAgICAgICAgICAgICAgICBpZih6IDwgMCkgdGhldGEgPSB0aGV0YSAqIC0xO1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMCBdID0gLTAuOCAqIHIgKiBNYXRoLmNvcyh0aGV0YSkgKyAwLjU7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAxIF0gPSAwLjggKiByICogTWF0aC5zaW4odGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVYKCBvcHRpb25zLnJvdGF0ZVgpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVkoIG9wdGlvbnMucm90YXRlWSk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWiggb3B0aW9ucy5yb3RhdGVaKTtcbiAgICAgICAgICAgIH1lbHNlIGlmKHRoaXMudmlkZW9UeXBlID09PSBcImR1YWxfZmlzaGV5ZVwiKXtcbiAgICAgICAgICAgICAgICBsZXQgbm9ybWFscyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgICAgIGxldCB1dnMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgICAgIGxldCBsID0gbm9ybWFscy5sZW5ndGggLyAzO1xuICAgICAgICAgICAgICAgIGZvciAoIGxldCBpID0gMDsgaSA8IGwgLyAyOyBpICsrICkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgeCA9IG5vcm1hbHNbIGkgKiAzICsgMCBdO1xuICAgICAgICAgICAgICAgICAgICBsZXQgeSA9IG5vcm1hbHNbIGkgKiAzICsgMSBdO1xuICAgICAgICAgICAgICAgICAgICBsZXQgeiA9IG5vcm1hbHNbIGkgKiAzICsgMiBdO1xuXG4gICAgICAgICAgICAgICAgICAgIGxldCByID0gKCB4ID09IDAgJiYgeiA9PSAwICkgPyAxIDogKCBNYXRoLmFjb3MoIHkgKSAvIE1hdGguc3FydCggeCAqIHggKyB6ICogeiApICkgKiAoIDIgLyBNYXRoLlBJICk7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAwIF0gPSB4ICogb3B0aW9ucy5kdWFsRmlzaC5jaXJjbGUxLnJ4ICogciAqIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS5jb3ZlclggICsgb3B0aW9ucy5kdWFsRmlzaC5jaXJjbGUxLng7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAxIF0gPSB6ICogb3B0aW9ucy5kdWFsRmlzaC5jaXJjbGUxLnJ5ICogciAqIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMS5jb3ZlclkgICsgb3B0aW9ucy5kdWFsRmlzaC5jaXJjbGUxLnk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoIGxldCBpID0gbCAvIDI7IGkgPCBsOyBpICsrICkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgeCA9IG5vcm1hbHNbIGkgKiAzICsgMCBdO1xuICAgICAgICAgICAgICAgICAgICBsZXQgeSA9IG5vcm1hbHNbIGkgKiAzICsgMSBdO1xuICAgICAgICAgICAgICAgICAgICBsZXQgeiA9IG5vcm1hbHNbIGkgKiAzICsgMiBdO1xuXG4gICAgICAgICAgICAgICAgICAgIGxldCByID0gKCB4ID09IDAgJiYgeiA9PSAwICkgPyAxIDogKCBNYXRoLmFjb3MoIC0geSApIC8gTWF0aC5zcXJ0KCB4ICogeCArIHogKiB6ICkgKSAqICggMiAvIE1hdGguUEkgKTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDAgXSA9IC0geCAqIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMi5yeCAqIHIgKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIuY292ZXJYICArIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMi54O1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMSBdID0geiAqIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMi5yeSAqIHIgKiBvcHRpb25zLmR1YWxGaXNoLmNpcmNsZTIuY292ZXJZICArIG9wdGlvbnMuZHVhbEZpc2guY2lyY2xlMi55O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVYKCBvcHRpb25zLnJvdGF0ZVgpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVkoIG9wdGlvbnMucm90YXRlWSk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWiggb3B0aW9ucy5yb3RhdGVaKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdlb21ldHJ5LnNjYWxlKCAtIDEsIDEsIDEgKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIG1lc2hcbiAgICAgICAgICAgIHRoaXMubWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LFxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvL3RoaXMubWVzaC5zY2FsZS54ID0gLTE7XG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLm1lc2gpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVuYWJsZVZSOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IHRydWU7XG4gICAgICAgICAgICBpZih0eXBlb2YgdnJITUQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgICAgICAgICB2YXIgZXllUGFyYW1zTCA9IHZySE1ELmdldEV5ZVBhcmFtZXRlcnMoICdsZWZ0JyApO1xuICAgICAgICAgICAgICAgIHZhciBleWVQYXJhbXNSID0gdnJITUQuZ2V0RXllUGFyYW1ldGVycyggJ3JpZ2h0JyApO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5leWVGT1ZMID0gZXllUGFyYW1zTC5yZWNvbW1lbmRlZEZpZWxkT2ZWaWV3O1xuICAgICAgICAgICAgICAgIHRoaXMuZXllRk9WUiA9IGV5ZVBhcmFtc1IucmVjb21tZW5kZWRGaWVsZE9mVmlldztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKHRoaXMuY2FtZXJhLmZvdiwgdGhpcy53aWR0aCAvMiAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUiA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSh0aGlzLmNhbWVyYS5mb3YsIHRoaXMud2lkdGggLzIgLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZGlzYWJsZVZSOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3NvciggMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVSZXNpemUuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIGlmKHRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZU1vdXNlV2hlZWwoZXZlbnQpO1xuICAgICAgICAgICAgLy8gV2ViS2l0XG4gICAgICAgICAgICBpZiAoIGV2ZW50LndoZWVsRGVsdGFZICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBGaXJlZm94XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC5kZXRhaWwgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ICs9IGV2ZW50LmRldGFpbCAqIDEuMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5tYXgodGhpcy5zZXR0aW5ncy5taW5Gb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICBpZih0aGlzLlZSTW9kZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IHRoaXMuY2FtZXJhLmZvdjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuZm92ID0gdGhpcy5jYW1lcmEuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVUb3VjaE1vdmU6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZVRvdWNoTW92ZS5jYWxsKHRoaXMsIGV2ZW50KTtcbiAgICAgICAgICAgIGlmKHRoaXMuaXNVc2VyUGluY2gpe1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50RGlzdGFuY2UgPSBVdGlsLmdldFRvdWNoZXNEaXN0YW5jZShldmVudC50b3VjaGVzKTtcbiAgICAgICAgICAgICAgICBldmVudC53aGVlbERlbHRhWSA9ICAoY3VycmVudERpc3RhbmNlIC0gdGhpcy5tdWx0aVRvdWNoRGlzdGFuY2UpICogMjtcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuY2FsbCh0aGlzLCBldmVudCk7XG4gICAgICAgICAgICAgICAgdGhpcy5tdWx0aVRvdWNoRGlzdGFuY2UgPSBjdXJyZW50RGlzdGFuY2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcGFyZW50LnJlbmRlci5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueSA9IDUwMCAqIE1hdGguY29zKCB0aGlzLnBoaSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5sb29rQXQoIHRoaXMuY2FtZXJhLnRhcmdldCApO1xuXG4gICAgICAgICAgICBpZighdGhpcy5WUk1vZGUpe1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICB2YXIgdmlld1BvcnRXaWR0aCA9IHRoaXMud2lkdGggLyAyLCB2aWV3UG9ydEhlaWdodCA9IHRoaXMuaGVpZ2h0O1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiB2ckhNRCAhPT0gJ3VuZGVmaW5lZCcpe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwucHJvamVjdGlvbk1hdHJpeCA9IFV0aWwuZm92VG9Qcm9qZWN0aW9uKCB0aGlzLmV5ZUZPVkwsIHRydWUsIHRoaXMuY2FtZXJhLm5lYXIsIHRoaXMuY2FtZXJhLmZhciApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIucHJvamVjdGlvbk1hdHJpeCA9IFV0aWwuZm92VG9Qcm9qZWN0aW9uKCB0aGlzLmV5ZUZPVlIsIHRydWUsIHRoaXMuY2FtZXJhLm5lYXIsIHRoaXMuY2FtZXJhLmZhciApO1xuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICB2YXIgbG9uTCA9IHRoaXMubG9uICsgdGhpcy5zZXR0aW5ncy5WUkdhcERlZ3JlZTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxvblIgPSB0aGlzLmxvbiAtIHRoaXMuc2V0dGluZ3MuVlJHYXBEZWdyZWU7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRoZXRhTCA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIGxvbkwgKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRoZXRhUiA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIGxvblIgKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0TCA9IFV0aWwuZGVlcENvcHkodGhpcy5jYW1lcmEudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0TC54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhldGFMICk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEwueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoZXRhTCApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwubG9va0F0KHRhcmdldEwpO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0YXJnZXRSID0gVXRpbC5kZWVwQ29weSh0aGlzLmNhbWVyYS50YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRSLnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGV0YVIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ui56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhldGFSICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5sb29rQXQodGFyZ2V0Uik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHJlbmRlciBsZWZ0IGV5ZVxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYUwgKTtcblxuICAgICAgICAgICAgICAgIC8vIHJlbmRlciByaWdodCBleWVcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3Nvciggdmlld1BvcnRXaWR0aCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmFSICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IENhbnZhcztcbiIsIi8qKlxuICogQGF1dGhvciBhbHRlcmVkcSAvIGh0dHA6Ly9hbHRlcmVkcXVhbGlhLmNvbS9cbiAqIEBhdXRob3IgbXIuZG9vYiAvIGh0dHA6Ly9tcmRvb2IuY29tL1xuICovXG5cbnZhciBEZXRlY3RvciA9IHtcblxuICAgIGNhbnZhczogISEgd2luZG93LkNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcbiAgICB3ZWJnbDogKCBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdHJ5IHtcblxuICAgICAgICAgICAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdjYW52YXMnICk7IHJldHVybiAhISAoIHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgJiYgKCBjYW52YXMuZ2V0Q29udGV4dCggJ3dlYmdsJyApIHx8IGNhbnZhcy5nZXRDb250ZXh0KCAnZXhwZXJpbWVudGFsLXdlYmdsJyApICkgKTtcblxuICAgICAgICB9IGNhdGNoICggZSApIHtcblxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIH1cblxuICAgIH0gKSgpLFxuICAgIHdvcmtlcnM6ICEhIHdpbmRvdy5Xb3JrZXIsXG4gICAgZmlsZWFwaTogd2luZG93LkZpbGUgJiYgd2luZG93LkZpbGVSZWFkZXIgJiYgd2luZG93LkZpbGVMaXN0ICYmIHdpbmRvdy5CbG9iLFxuXG4gICAgIENoZWNrX1ZlcnNpb246IGZ1bmN0aW9uKCkge1xuICAgICAgICAgdmFyIHJ2ID0gLTE7IC8vIFJldHVybiB2YWx1ZSBhc3N1bWVzIGZhaWx1cmUuXG5cbiAgICAgICAgIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSAnTWljcm9zb2Z0IEludGVybmV0IEV4cGxvcmVyJykge1xuXG4gICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudCxcbiAgICAgICAgICAgICAgICAgcmUgPSBuZXcgUmVnRXhwKFwiTVNJRSAoWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuXG4gICAgICAgICAgICAgaWYgKHJlLmV4ZWModWEpICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgIH1cbiAgICAgICAgIGVsc2UgaWYgKG5hdmlnYXRvci5hcHBOYW1lID09IFwiTmV0c2NhcGVcIikge1xuICAgICAgICAgICAgIC8vLyBpbiBJRSAxMSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gc2F5cyAndHJpZGVudCdcbiAgICAgICAgICAgICAvLy8gaW4gRWRnZSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gZG9lcyBub3Qgc2F5IHRyaWRlbnRcbiAgICAgICAgICAgICBpZiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZignVHJpZGVudCcpICE9PSAtMSkgcnYgPSAxMTtcbiAgICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgICB2YXIgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuICAgICAgICAgICAgICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKFwiRWRnZVxcLyhbMC05XXsxLH1bXFxcXC4wLTldezAsfSlcIik7XG4gICAgICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgcnYgPSBwYXJzZUZsb2F0KFJlZ0V4cC4kMSk7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG5cbiAgICAgICAgIHJldHVybiBydjtcbiAgICAgfSxcblxuICAgIHN1cHBvcnRWaWRlb1RleHR1cmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy9pZSAxMSBhbmQgZWRnZSAxMiBkb2Vzbid0IHN1cHBvcnQgdmlkZW8gdGV4dHVyZS5cbiAgICAgICAgdmFyIHZlcnNpb24gPSB0aGlzLkNoZWNrX1ZlcnNpb24oKTtcbiAgICAgICAgcmV0dXJuICh2ZXJzaW9uID09PSAtMSB8fCB2ZXJzaW9uID49IDEzKTtcbiAgICB9LFxuXG4gICAgaXNMaXZlU3RyZWFtT25TYWZhcmk6IGZ1bmN0aW9uICh2aWRlb0VsZW1lbnQpIHtcbiAgICAgICAgLy9saXZlIHN0cmVhbSBvbiBzYWZhcmkgZG9lc24ndCBzdXBwb3J0IHZpZGVvIHRleHR1cmVcbiAgICAgICAgdmFyIHZpZGVvU291cmNlcyA9IHZpZGVvRWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKFwic291cmNlXCIpO1xuICAgICAgICB2YXIgcmVzdWx0ID0gZmFsc2U7XG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCB2aWRlb1NvdXJjZXMubGVuZ3RoOyBpKyspe1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRWaWRlb1NvdXJjZSA9IHZpZGVvU291cmNlc1tpXTtcbiAgICAgICAgICAgIGlmKChjdXJyZW50VmlkZW9Tb3VyY2UudHlwZSA9PSBcImFwcGxpY2F0aW9uL3gtbXBlZ1VSTFwiIHx8IGN1cnJlbnRWaWRlb1NvdXJjZS50eXBlID09IFwiYXBwbGljYXRpb24vdm5kLmFwcGxlLm1wZWd1cmxcIikgJiYgLyhTYWZhcml8QXBwbGVXZWJLaXQpLy50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpICYmIC9BcHBsZSBDb21wdXRlci8udGVzdChuYXZpZ2F0b3IudmVuZG9yKSl7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGdldFdlYkdMRXJyb3JNZXNzYWdlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgICAgICBlbGVtZW50LmlkID0gJ3dlYmdsLWVycm9yLW1lc3NhZ2UnO1xuXG4gICAgICAgIGlmICggISB0aGlzLndlYmdsICkge1xuXG4gICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgPyBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgZ3JhcGhpY3MgY2FyZCBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIgLz4nLFxuICAgICAgICAgICAgICAgICdGaW5kIG91dCBob3cgdG8gZ2V0IGl0IDxhIGhyZWY9XCJodHRwOi8vZ2V0LndlYmdsLm9yZy9cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5oZXJlPC9hPi4nXG4gICAgICAgICAgICBdLmpvaW4oICdcXG4nICkgOiBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgYnJvd3NlciBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG5cbiAgICB9LFxuXG4gICAgYWRkR2V0V2ViR0xNZXNzYWdlOiBmdW5jdGlvbiAoIHBhcmFtZXRlcnMgKSB7XG5cbiAgICAgICAgdmFyIHBhcmVudCwgaWQsIGVsZW1lbnQ7XG5cbiAgICAgICAgcGFyYW1ldGVycyA9IHBhcmFtZXRlcnMgfHwge307XG5cbiAgICAgICAgcGFyZW50ID0gcGFyYW1ldGVycy5wYXJlbnQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMucGFyZW50IDogZG9jdW1lbnQuYm9keTtcbiAgICAgICAgaWQgPSBwYXJhbWV0ZXJzLmlkICE9PSB1bmRlZmluZWQgPyBwYXJhbWV0ZXJzLmlkIDogJ29sZGllJztcblxuICAgICAgICBlbGVtZW50ID0gRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKTtcbiAgICAgICAgZWxlbWVudC5pZCA9IGlkO1xuXG4gICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCggZWxlbWVudCApO1xuXG4gICAgfVxuXG59O1xuXG5leHBvcnQgZGVmYXVsdCBEZXRlY3RvcjsiLCIvKipcbiAqIENyZWF0ZWQgYnkgd2Vuc2hlbmcueWFuIG9uIDUvMjMvMTYuXG4gKi9cbnZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5lbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLWhlbHBlci1jYW52YXNcIjtcblxudmFyIEhlbHBlckNhbnZhcyA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICB0aGlzLnZpZGVvRWxlbWVudCA9IG9wdGlvbnMudmlkZW87XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gb3B0aW9ucy53aWR0aDtcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XG5cbiAgICAgICAgICAgIGVsZW1lbnQud2lkdGggPSB0aGlzLndpZHRoO1xuICAgICAgICAgICAgZWxlbWVudC5oZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG5cblxuICAgICAgICAgICAgdGhpcy5jb250ZXh0ID0gZWxlbWVudC5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBnZXRDb250ZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dDsgIFxuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgSGVscGVyQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNi82LzE2LlxuICovXG52YXIgTW9iaWxlQnVmZmVyaW5nID0ge1xuICAgIHByZXZfY3VycmVudFRpbWU6IDAsXG4gICAgY291bnRlcjogMCxcbiAgICBcbiAgICBpc0J1ZmZlcmluZzogZnVuY3Rpb24gKGN1cnJlbnRUaW1lKSB7XG4gICAgICAgIGlmIChjdXJyZW50VGltZSA9PSB0aGlzLnByZXZfY3VycmVudFRpbWUpIHRoaXMuY291bnRlcisrO1xuICAgICAgICBlbHNlIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucHJldl9jdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICBpZih0aGlzLmNvdW50ZXIgPiAxMCl7XG4gICAgICAgICAgICAvL25vdCBsZXQgY291bnRlciBvdmVyZmxvd1xuICAgICAgICAgICAgdGhpcy5jb3VudGVyID0gMTA7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgTW9iaWxlQnVmZmVyaW5nOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC80LzE2LlxuICovXG5cbnZhciBOb3RpY2UgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcbiAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVsZW1lbnQuY2xhc3NOYW1lID0gXCJ2anMtdmlkZW8tbm90aWNlLWxhYmVsXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgaWYodHlwZW9mIG9wdGlvbnMuTm90aWNlTWVzc2FnZSA9PSBcIm9iamVjdFwiKXtcbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICB9ZWxzZSBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwic3RyaW5nXCIpe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBlbGVtZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBOb3RpY2U7IiwiLyoqXG4gKlxuICogKGMpIFdlbnNoZW5nIFlhbiA8eWFud3NoQGdtYWlsLmNvbT5cbiAqIERhdGU6IDEwLzIxLzE2XG4gKlxuICogRm9yIHRoZSBmdWxsIGNvcHlyaWdodCBhbmQgbGljZW5zZSBpbmZvcm1hdGlvbiwgcGxlYXNlIHZpZXcgdGhlIExJQ0VOU0VcbiAqIGZpbGUgdGhhdCB3YXMgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzIHNvdXJjZSBjb2RlLlxuICovXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCBCYXNlQ2FudmFzIGZyb20gJy4vQmFzZUNhbnZhcyc7XG5pbXBvcnQgVXRpbCBmcm9tICcuL1V0aWwnO1xuXG52YXIgVGhyZWVEQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KXtcbiAgICB2YXIgcGFyZW50ID0gQmFzZUNhbnZhcyhiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MpO1xuICAgIHJldHVybiBVdGlsLmV4dGVuZChwYXJlbnQsIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHBhcmVudC5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgICAgICAvL29ubHkgc2hvdyBsZWZ0IHBhcnQgYnkgZGVmYXVsdFxuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vZGVmaW5lIHNjZW5lXG4gICAgICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG5cbiAgICAgICAgICAgIHZhciBhc3BlY3RSYXRpbyA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgYXNwZWN0UmF0aW8sIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAwLCAwLCAwICk7XG5cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUiA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShvcHRpb25zLmluaXRGb3YsIGFzcGVjdFJhdGlvIC8gMiwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIucG9zaXRpb24uc2V0KCAxMDAwLCAwLCAwICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDEwMDAsIDAsIDAgKTtcblxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5TCA9IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSg1MDAsIDYwLCA0MCkudG9Ob25JbmRleGVkKCk7XG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnlSID0gbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KDUwMCwgNjAsIDQwKS50b05vbkluZGV4ZWQoKTtcblxuICAgICAgICAgICAgdmFyIHV2c0wgPSBnZW9tZXRyeUwuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgIHZhciBub3JtYWxzTCA9IGdlb21ldHJ5TC5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IG5vcm1hbHNMLmxlbmd0aCAvIDM7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgdXZzTFsgaSAqIDIgKyAxIF0gPSB1dnNMWyBpICogMiArIDEgXSAvIDI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB1dnNSID0gZ2VvbWV0cnlSLmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICB2YXIgbm9ybWFsc1IgPSBnZW9tZXRyeVIuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBub3JtYWxzUi5sZW5ndGggLyAzOyBpICsrICkge1xuICAgICAgICAgICAgICAgIHV2c1JbIGkgKiAyICsgMSBdID0gdXZzUlsgaSAqIDIgKyAxIF0gLyAyICsgMC41O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBnZW9tZXRyeUwuc2NhbGUoIC0gMSwgMSwgMSApO1xuICAgICAgICAgICAgZ2VvbWV0cnlSLnNjYWxlKCAtIDEsIDEsIDEgKTtcblxuICAgICAgICAgICAgdGhpcy5tZXNoTCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5TCxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICB0aGlzLm1lc2hSID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnlSLFxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aGlzLm1lc2hSLnBvc2l0aW9uLnNldCgxMDAwLCAwLCAwKTtcblxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoTCk7XG5cbiAgICAgICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVSZXNpemUuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHZhciBhc3BlY3RSYXRpbyA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIGlmKCF0aGlzLlZSTW9kZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5hc3BlY3QgPSBhc3BlY3RSYXRpbztcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgYXNwZWN0UmF0aW8gLz0gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gYXNwZWN0UmF0aW87XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmFzcGVjdCA9IGFzcGVjdFJhdGlvO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBwYXJlbnQuaGFuZGxlTW91c2VXaGVlbChldmVudCk7XG4gICAgICAgICAgICAvLyBXZWJLaXRcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gRmlyZWZveFxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQuZGV0YWlsICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgKz0gZXZlbnQuZGV0YWlsICogMS4wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYUwuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgPSBNYXRoLm1heCh0aGlzLnNldHRpbmdzLm1pbkZvdiwgdGhpcy5jYW1lcmFMLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgaWYodGhpcy5WUk1vZGUpe1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5mb3YgPSB0aGlzLmNhbWVyYUwuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZW5hYmxlVlI6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoUik7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZVJlc2l6ZSgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGRpc2FibGVWUjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUodGhpcy5tZXNoUik7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZVJlc2l6ZSgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHBhcmVudC5yZW5kZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueSA9IDUwMCAqIE1hdGguY29zKCB0aGlzLnBoaSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmxvb2tBdCh0aGlzLmNhbWVyYUwudGFyZ2V0KTtcblxuICAgICAgICAgICAgaWYodGhpcy5WUk1vZGUpe1xuICAgICAgICAgICAgICAgIHZhciB2aWV3UG9ydFdpZHRoID0gdGhpcy53aWR0aCAvIDIsIHZpZXdQb3J0SGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldC54ID0gMTAwMCArIDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0LnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmxvb2tBdCggdGhpcy5jYW1lcmFSLnRhcmdldCApO1xuXG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIGxlZnQgZXllXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhTCApO1xuXG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIHJpZ2h0IGV5ZVxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYVIgKTtcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYUwgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgVGhyZWVEQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB3ZW5zaGVuZy55YW4gb24gNC80LzE2LlxuICovXG5mdW5jdGlvbiB3aGljaFRyYW5zaXRpb25FdmVudCgpe1xuICAgIHZhciB0O1xuICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zha2VlbGVtZW50Jyk7XG4gICAgdmFyIHRyYW5zaXRpb25zID0ge1xuICAgICAgICAndHJhbnNpdGlvbic6J3RyYW5zaXRpb25lbmQnLFxuICAgICAgICAnT1RyYW5zaXRpb24nOidvVHJhbnNpdGlvbkVuZCcsXG4gICAgICAgICdNb3pUcmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdXZWJraXRUcmFuc2l0aW9uJzond2Via2l0VHJhbnNpdGlvbkVuZCdcbiAgICB9O1xuXG4gICAgZm9yKHQgaW4gdHJhbnNpdGlvbnMpe1xuICAgICAgICBpZiggZWwuc3R5bGVbdF0gIT09IHVuZGVmaW5lZCApe1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zaXRpb25zW3RdO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtb2JpbGVBbmRUYWJsZXRjaGVjaygpIHtcbiAgICB2YXIgY2hlY2sgPSBmYWxzZTtcbiAgICAoZnVuY3Rpb24oYSl7aWYoLyhhbmRyb2lkfGJiXFxkK3xtZWVnbykuK21vYmlsZXxhdmFudGdvfGJhZGFcXC98YmxhY2tiZXJyeXxibGF6ZXJ8Y29tcGFsfGVsYWluZXxmZW5uZWN8aGlwdG9wfGllbW9iaWxlfGlwKGhvbmV8b2QpfGlyaXN8a2luZGxlfGxnZSB8bWFlbW98bWlkcHxtbXB8bW9iaWxlLitmaXJlZm94fG5ldGZyb250fG9wZXJhIG0ob2J8aW4paXxwYWxtKCBvcyk/fHBob25lfHAoaXhpfHJlKVxcL3xwbHVja2VyfHBvY2tldHxwc3B8c2VyaWVzKDR8NikwfHN5bWJpYW58dHJlb3x1cFxcLihicm93c2VyfGxpbmspfHZvZGFmb25lfHdhcHx3aW5kb3dzIGNlfHhkYXx4aWlub3xhbmRyb2lkfGlwYWR8cGxheWJvb2t8c2lsay9pLnRlc3QoYSl8fC8xMjA3fDYzMTB8NjU5MHwzZ3NvfDR0aHB8NTBbMS02XWl8Nzcwc3w4MDJzfGEgd2F8YWJhY3xhYyhlcnxvb3xzXFwtKXxhaShrb3xybil8YWwoYXZ8Y2F8Y28pfGFtb2l8YW4oZXh8bnl8eXcpfGFwdHV8YXIoY2h8Z28pfGFzKHRlfHVzKXxhdHR3fGF1KGRpfFxcLW18ciB8cyApfGF2YW58YmUoY2t8bGx8bnEpfGJpKGxifHJkKXxibChhY3xheil8YnIoZXx2KXd8YnVtYnxid1xcLShufHUpfGM1NVxcL3xjYXBpfGNjd2F8Y2RtXFwtfGNlbGx8Y2h0bXxjbGRjfGNtZFxcLXxjbyhtcHxuZCl8Y3Jhd3xkYShpdHxsbHxuZyl8ZGJ0ZXxkY1xcLXN8ZGV2aXxkaWNhfGRtb2J8ZG8oY3xwKW98ZHMoMTJ8XFwtZCl8ZWwoNDl8YWkpfGVtKGwyfHVsKXxlcihpY3xrMCl8ZXNsOHxleihbNC03XTB8b3N8d2F8emUpfGZldGN8Zmx5KFxcLXxfKXxnMSB1fGc1NjB8Z2VuZXxnZlxcLTV8Z1xcLW1vfGdvKFxcLnd8b2QpfGdyKGFkfHVuKXxoYWllfGhjaXR8aGRcXC0obXxwfHQpfGhlaVxcLXxoaShwdHx0YSl8aHAoIGl8aXApfGhzXFwtY3xodChjKFxcLXwgfF98YXxnfHB8c3x0KXx0cCl8aHUoYXd8dGMpfGlcXC0oMjB8Z298bWEpfGkyMzB8aWFjKCB8XFwtfFxcLyl8aWJyb3xpZGVhfGlnMDF8aWtvbXxpbTFrfGlubm98aXBhcXxpcmlzfGphKHR8dilhfGpicm98amVtdXxqaWdzfGtkZGl8a2VqaXxrZ3QoIHxcXC8pfGtsb258a3B0IHxrd2NcXC18a3lvKGN8ayl8bGUobm98eGkpfGxnKCBnfFxcLyhrfGx8dSl8NTB8NTR8XFwtW2Etd10pfGxpYnd8bHlueHxtMVxcLXd8bTNnYXxtNTBcXC98bWEodGV8dWl8eG8pfG1jKDAxfDIxfGNhKXxtXFwtY3J8bWUocmN8cmkpfG1pKG84fG9hfHRzKXxtbWVmfG1vKDAxfDAyfGJpfGRlfGRvfHQoXFwtfCB8b3x2KXx6eil8bXQoNTB8cDF8diApfG13YnB8bXl3YXxuMTBbMC0yXXxuMjBbMi0zXXxuMzAoMHwyKXxuNTAoMHwyfDUpfG43KDAoMHwxKXwxMCl8bmUoKGN8bSlcXC18b258dGZ8d2Z8d2d8d3QpfG5vayg2fGkpfG56cGh8bzJpbXxvcCh0aXx3dil8b3Jhbnxvd2cxfHA4MDB8cGFuKGF8ZHx0KXxwZHhnfHBnKDEzfFxcLShbMS04XXxjKSl8cGhpbHxwaXJlfHBsKGF5fHVjKXxwblxcLTJ8cG8oY2t8cnR8c2UpfHByb3h8cHNpb3xwdFxcLWd8cWFcXC1hfHFjKDA3fDEyfDIxfDMyfDYwfFxcLVsyLTddfGlcXC0pfHF0ZWt8cjM4MHxyNjAwfHJha3N8cmltOXxybyh2ZXx6byl8czU1XFwvfHNhKGdlfG1hfG1tfG1zfG55fHZhKXxzYygwMXxoXFwtfG9vfHBcXC0pfHNka1xcL3xzZShjKFxcLXwwfDEpfDQ3fG1jfG5kfHJpKXxzZ2hcXC18c2hhcnxzaWUoXFwtfG0pfHNrXFwtMHxzbCg0NXxpZCl8c20oYWx8YXJ8YjN8aXR8dDUpfHNvKGZ0fG55KXxzcCgwMXxoXFwtfHZcXC18diApfHN5KDAxfG1iKXx0MigxOHw1MCl8dDYoMDB8MTB8MTgpfHRhKGd0fGxrKXx0Y2xcXC18dGRnXFwtfHRlbChpfG0pfHRpbVxcLXx0XFwtbW98dG8ocGx8c2gpfHRzKDcwfG1cXC18bTN8bTUpfHR4XFwtOXx1cChcXC5ifGcxfHNpKXx1dHN0fHY0MDB8djc1MHx2ZXJpfHZpKHJnfHRlKXx2ayg0MHw1WzAtM118XFwtdil8dm00MHx2b2RhfHZ1bGN8dngoNTJ8NTN8NjB8NjF8NzB8ODB8ODF8ODN8ODV8OTgpfHczYyhcXC18ICl8d2ViY3x3aGl0fHdpKGcgfG5jfG53KXx3bWxifHdvbnV8eDcwMHx5YXNcXC18eW91cnx6ZXRvfHp0ZVxcLS9pLnRlc3QoYS5zdWJzdHIoMCw0KSkpY2hlY2sgPSB0cnVlfSkobmF2aWdhdG9yLnVzZXJBZ2VudHx8bmF2aWdhdG9yLnZlbmRvcnx8d2luZG93Lm9wZXJhKTtcbiAgICByZXR1cm4gY2hlY2s7XG59XG5cbmZ1bmN0aW9uIGlzSW9zKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQYWR8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG59XG5cbmZ1bmN0aW9uIGlzUmVhbElwaG9uZSgpIHtcbiAgICByZXR1cm4gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pO1xufVxuXG4vL2Fkb3B0IGNvZGUgZnJvbTogaHR0cHM6Ly9naXRodWIuY29tL01velZSL3ZyLXdlYi1leGFtcGxlcy9ibG9iL21hc3Rlci90aHJlZWpzLXZyLWJvaWxlcnBsYXRlL2pzL1ZSRWZmZWN0LmpzXG5mdW5jdGlvbiBmb3ZUb05EQ1NjYWxlT2Zmc2V0KCBmb3YgKSB7XG4gICAgdmFyIHB4c2NhbGUgPSAyLjAgLyAoZm92LmxlZnRUYW4gKyBmb3YucmlnaHRUYW4pO1xuICAgIHZhciBweG9mZnNldCA9IChmb3YubGVmdFRhbiAtIGZvdi5yaWdodFRhbikgKiBweHNjYWxlICogMC41O1xuICAgIHZhciBweXNjYWxlID0gMi4wIC8gKGZvdi51cFRhbiArIGZvdi5kb3duVGFuKTtcbiAgICB2YXIgcHlvZmZzZXQgPSAoZm92LnVwVGFuIC0gZm92LmRvd25UYW4pICogcHlzY2FsZSAqIDAuNTtcbiAgICByZXR1cm4geyBzY2FsZTogWyBweHNjYWxlLCBweXNjYWxlIF0sIG9mZnNldDogWyBweG9mZnNldCwgcHlvZmZzZXQgXSB9O1xufVxuXG5mdW5jdGlvbiBmb3ZQb3J0VG9Qcm9qZWN0aW9uKCBmb3YsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApIHtcblxuICAgIHJpZ2h0SGFuZGVkID0gcmlnaHRIYW5kZWQgPT09IHVuZGVmaW5lZCA/IHRydWUgOiByaWdodEhhbmRlZDtcbiAgICB6TmVhciA9IHpOZWFyID09PSB1bmRlZmluZWQgPyAwLjAxIDogek5lYXI7XG4gICAgekZhciA9IHpGYXIgPT09IHVuZGVmaW5lZCA/IDEwMDAwLjAgOiB6RmFyO1xuXG4gICAgdmFyIGhhbmRlZG5lc3NTY2FsZSA9IHJpZ2h0SGFuZGVkID8gLTEuMCA6IDEuMDtcblxuICAgIC8vIHN0YXJ0IHdpdGggYW4gaWRlbnRpdHkgbWF0cml4XG4gICAgdmFyIG1vYmogPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICAgIHZhciBtID0gbW9iai5lbGVtZW50cztcblxuICAgIC8vIGFuZCB3aXRoIHNjYWxlL29mZnNldCBpbmZvIGZvciBub3JtYWxpemVkIGRldmljZSBjb29yZHNcbiAgICB2YXIgc2NhbGVBbmRPZmZzZXQgPSBmb3ZUb05EQ1NjYWxlT2Zmc2V0KGZvdik7XG5cbiAgICAvLyBYIHJlc3VsdCwgbWFwIGNsaXAgZWRnZXMgdG8gWy13LCt3XVxuICAgIG1bMCAqIDQgKyAwXSA9IHNjYWxlQW5kT2Zmc2V0LnNjYWxlWzBdO1xuICAgIG1bMCAqIDQgKyAxXSA9IDAuMDtcbiAgICBtWzAgKiA0ICsgMl0gPSBzY2FsZUFuZE9mZnNldC5vZmZzZXRbMF0gKiBoYW5kZWRuZXNzU2NhbGU7XG4gICAgbVswICogNCArIDNdID0gMC4wO1xuXG4gICAgLy8gWSByZXN1bHQsIG1hcCBjbGlwIGVkZ2VzIHRvIFstdywrd11cbiAgICAvLyBZIG9mZnNldCBpcyBuZWdhdGVkIGJlY2F1c2UgdGhpcyBwcm9qIG1hdHJpeCB0cmFuc2Zvcm1zIGZyb20gd29ybGQgY29vcmRzIHdpdGggWT11cCxcbiAgICAvLyBidXQgdGhlIE5EQyBzY2FsaW5nIGhhcyBZPWRvd24gKHRoYW5rcyBEM0Q/KVxuICAgIG1bMSAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzEgKiA0ICsgMV0gPSBzY2FsZUFuZE9mZnNldC5zY2FsZVsxXTtcbiAgICBtWzEgKiA0ICsgMl0gPSAtc2NhbGVBbmRPZmZzZXQub2Zmc2V0WzFdICogaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMSAqIDQgKyAzXSA9IDAuMDtcblxuICAgIC8vIFogcmVzdWx0ICh1cCB0byB0aGUgYXBwKVxuICAgIG1bMiAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzIgKiA0ICsgMV0gPSAwLjA7XG4gICAgbVsyICogNCArIDJdID0gekZhciAvICh6TmVhciAtIHpGYXIpICogLWhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzIgKiA0ICsgM10gPSAoekZhciAqIHpOZWFyKSAvICh6TmVhciAtIHpGYXIpO1xuXG4gICAgLy8gVyByZXN1bHQgKD0gWiBpbilcbiAgICBtWzMgKiA0ICsgMF0gPSAwLjA7XG4gICAgbVszICogNCArIDFdID0gMC4wO1xuICAgIG1bMyAqIDQgKyAyXSA9IGhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzMgKiA0ICsgM10gPSAwLjA7XG5cbiAgICBtb2JqLnRyYW5zcG9zZSgpO1xuXG4gICAgcmV0dXJuIG1vYmo7XG59XG5cbmZ1bmN0aW9uIGZvdlRvUHJvamVjdGlvbiggZm92LCByaWdodEhhbmRlZCwgek5lYXIsIHpGYXIgKSB7XG4gICAgdmFyIERFRzJSQUQgPSBNYXRoLlBJIC8gMTgwLjA7XG5cbiAgICB2YXIgZm92UG9ydCA9IHtcbiAgICAgICAgdXBUYW46IE1hdGgudGFuKCBmb3YudXBEZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICBkb3duVGFuOiBNYXRoLnRhbiggZm92LmRvd25EZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICBsZWZ0VGFuOiBNYXRoLnRhbiggZm92LmxlZnREZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICByaWdodFRhbjogTWF0aC50YW4oIGZvdi5yaWdodERlZ3JlZXMgKiBERUcyUkFEIClcbiAgICB9O1xuXG4gICAgcmV0dXJuIGZvdlBvcnRUb1Byb2plY3Rpb24oIGZvdlBvcnQsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApO1xufVxuXG5mdW5jdGlvbiBleHRlbmQoc3VwZXJDbGFzcywgc3ViQ2xhc3NNZXRob2RzID0ge30pXG57XG4gICAgZm9yKHZhciBtZXRob2QgaW4gc3VwZXJDbGFzcyl7XG4gICAgICAgIGlmKHN1cGVyQ2xhc3MuaGFzT3duUHJvcGVydHkobWV0aG9kKSAmJiAhc3ViQ2xhc3NNZXRob2RzLmhhc093blByb3BlcnR5KG1ldGhvZCkpe1xuICAgICAgICAgICAgc3ViQ2xhc3NNZXRob2RzW21ldGhvZF0gPSBzdXBlckNsYXNzW21ldGhvZF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1YkNsYXNzTWV0aG9kcztcbn1cblxuZnVuY3Rpb24gZGVlcENvcHkob2JqKSB7XG4gICAgdmFyIHRvID0ge307XG5cbiAgICBmb3IgKHZhciBuYW1lIGluIG9iailcbiAgICB7XG4gICAgICAgIHRvW25hbWVdID0gb2JqW25hbWVdO1xuICAgIH1cblxuICAgIHJldHVybiB0bztcbn1cblxuZnVuY3Rpb24gZ2V0VG91Y2hlc0Rpc3RhbmNlKHRvdWNoZXMpe1xuICAgIHJldHVybiBNYXRoLnNxcnQoXG4gICAgICAgICh0b3VjaGVzWzBdLmNsaWVudFgtdG91Y2hlc1sxXS5jbGllbnRYKSAqICh0b3VjaGVzWzBdLmNsaWVudFgtdG91Y2hlc1sxXS5jbGllbnRYKSArXG4gICAgICAgICh0b3VjaGVzWzBdLmNsaWVudFktdG91Y2hlc1sxXS5jbGllbnRZKSAqICh0b3VjaGVzWzBdLmNsaWVudFktdG91Y2hlc1sxXS5jbGllbnRZKSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgICB3aGljaFRyYW5zaXRpb25FdmVudDogd2hpY2hUcmFuc2l0aW9uRXZlbnQsXG4gICAgbW9iaWxlQW5kVGFibGV0Y2hlY2s6IG1vYmlsZUFuZFRhYmxldGNoZWNrLFxuICAgIGlzSW9zOiBpc0lvcyxcbiAgICBpc1JlYWxJcGhvbmU6IGlzUmVhbElwaG9uZSxcbiAgICBmb3ZUb1Byb2plY3Rpb246IGZvdlRvUHJvamVjdGlvbixcbiAgICBleHRlbmQ6IGV4dGVuZCxcbiAgICBkZWVwQ29weTogZGVlcENvcHksXG4gICAgZ2V0VG91Y2hlc0Rpc3RhbmNlOiBnZXRUb3VjaGVzRGlzdGFuY2Vcbn07IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA4LzEzLzE2LlxuICovXG5cbnZhciBWUkJ1dHRvbiA9IGZ1bmN0aW9uKEJ1dHRvbkNvbXBvbmVudCl7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIEJ1dHRvbkNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYnVpbGRDU1NDbGFzczogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gYHZqcy1WUi1jb250cm9sICR7QnV0dG9uQ29tcG9uZW50LnByb3RvdHlwZS5idWlsZENTU0NsYXNzLmNhbGwodGhpcyl9YDtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVDbGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGNhbnZhcyA9IHRoaXMucGxheWVyKCkuZ2V0Q2hpbGQoXCJDYW52YXNcIik7XG4gICAgICAgICAgICAoIWNhbnZhcy5WUk1vZGUpPyBjYW52YXMuZW5hYmxlVlIoKSA6IGNhbnZhcy5kaXNhYmxlVlIoKTtcbiAgICAgICAgICAgIChjYW52YXMuVlJNb2RlKT8gdGhpcy5hZGRDbGFzcyhcImVuYWJsZVwiKSA6IHRoaXMucmVtb3ZlQ2xhc3MoXCJlbmFibGVcIik7XG4gICAgICAgICAgICAoY2FudmFzLlZSTW9kZSk/ICB0aGlzLnBsYXllcigpLnRyaWdnZXIoJ1ZSTW9kZU9uJyk6ICB0aGlzLnBsYXllcigpLnRyaWdnZXIoJ1ZSTW9kZU9mZicpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNvbnRyb2xUZXh0XzogXCJWUlwiXG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgVlJCdXR0b247IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzMvMTYuXG4gKi9cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IHV0aWwgZnJvbSAnLi9saWIvVXRpbCc7XG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi9saWIvRGV0ZWN0b3InO1xuaW1wb3J0IG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lIGZyb20gJ2lwaG9uZS1pbmxpbmUtdmlkZW8nO1xuXG5jb25zdCBydW5Pbk1vYmlsZSA9ICh1dGlsLm1vYmlsZUFuZFRhYmxldGNoZWNrKCkpO1xuXG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHRoZSBwbHVnaW4uXG5jb25zdCBkZWZhdWx0cyA9IHtcbiAgICBjbGlja0FuZERyYWc6IHJ1bk9uTW9iaWxlLFxuICAgIHNob3dOb3RpY2U6IHRydWUsXG4gICAgTm90aWNlTWVzc2FnZTogXCJQbGVhc2UgdXNlIHlvdXIgbW91c2UgZHJhZyBhbmQgZHJvcCB0aGUgdmlkZW8uXCIsXG4gICAgYXV0b0hpZGVOb3RpY2U6IDMwMDAsXG4gICAgLy9saW1pdCB0aGUgdmlkZW8gc2l6ZSB3aGVuIHVzZXIgc2Nyb2xsLlxuICAgIHNjcm9sbGFibGU6IHRydWUsXG4gICAgaW5pdEZvdjogNzUsXG4gICAgbWF4Rm92OiAxMDUsXG4gICAgbWluRm92OiA1MSxcbiAgICAvL2luaXRpYWwgcG9zaXRpb24gZm9yIHRoZSB2aWRlb1xuICAgIGluaXRMYXQ6IDAsXG4gICAgaW5pdExvbjogLTE4MCxcbiAgICAvL0EgZmxvYXQgdmFsdWUgYmFjayB0byBjZW50ZXIgd2hlbiBtb3VzZSBvdXQgdGhlIGNhbnZhcy4gVGhlIGhpZ2hlciwgdGhlIGZhc3Rlci5cbiAgICByZXR1cm5TdGVwTGF0OiAwLjUsXG4gICAgcmV0dXJuU3RlcExvbjogMixcbiAgICBiYWNrVG9WZXJ0aWNhbENlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGJhY2tUb0hvcml6b25DZW50ZXI6ICFydW5Pbk1vYmlsZSxcbiAgICBjbGlja1RvVG9nZ2xlOiBmYWxzZSxcblxuICAgIC8vbGltaXQgdmlld2FibGUgem9vbVxuICAgIG1pbkxhdDogLTg1LFxuICAgIG1heExhdDogODUsXG5cbiAgICBtaW5Mb246IC1JbmZpbml0eSxcbiAgICBtYXhMb246IEluZmluaXR5LFxuXG4gICAgdmlkZW9UeXBlOiBcImVxdWlyZWN0YW5ndWxhclwiLFxuXG4gICAgcm90YXRlWDogMCxcbiAgICByb3RhdGVZOiAwLFxuICAgIHJvdGF0ZVo6IDAsXG5cbiAgICBhdXRvTW9iaWxlT3JpZW50YXRpb246IGZhbHNlLFxuICAgIG1vYmlsZVZpYnJhdGlvblZhbHVlOiB1dGlsLmlzSW9zKCk/IDAuMDIyIDogMSxcblxuICAgIFZSRW5hYmxlOiB0cnVlLFxuICAgIFZSR2FwRGVncmVlOiAyLjUsXG5cbiAgICBjbG9zZVBhbm9yYW1hOiBmYWxzZSxcblxuICAgIGhlbHBlckNhbnZhczoge30sXG5cbiAgICBkdWFsRmlzaDoge1xuICAgICAgICB3aWR0aDogMTkyMCxcbiAgICAgICAgaGVpZ2h0OiAxMDgwLFxuICAgICAgICBjaXJjbGUxOiB7XG4gICAgICAgICAgICB4OiAwLjI0MDYyNSxcbiAgICAgICAgICAgIHk6IDAuNTUzNzA0LFxuICAgICAgICAgICAgcng6IDAuMjMzMzMsXG4gICAgICAgICAgICByeTogMC40MzE0OCxcbiAgICAgICAgICAgIGNvdmVyWDogMC45MTMsXG4gICAgICAgICAgICBjb3Zlclk6IDAuOVxuICAgICAgICB9LFxuICAgICAgICBjaXJjbGUyOiB7XG4gICAgICAgICAgICB4OiAwLjc1NzI5MixcbiAgICAgICAgICAgIHk6IDAuNTUzNzA0LFxuICAgICAgICAgICAgcng6IDAuMjMyMjkyLFxuICAgICAgICAgICAgcnk6IDAuNDI5NjI5NixcbiAgICAgICAgICAgIGNvdmVyWDogMC45MTMsXG4gICAgICAgICAgICBjb3Zlclk6IDAuOTMwOFxuICAgICAgICB9XG4gICAgfVxufTtcblxuZnVuY3Rpb24gcGxheWVyUmVzaXplKHBsYXllcil7XG4gICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUud2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCArIFwicHhcIjtcbiAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUuaGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XG4gICAgfTtcbn1cblxuZnVuY3Rpb24gZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgY2xpY2tGbikge1xuICAgIHZhciByZXNpemVGbiA9IHBsYXllclJlc2l6ZShwbGF5ZXIpO1xuICAgIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUub2ZmKFwidGFwXCIsIGNsaWNrRm4pO1xuICAgIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUub24oXCJ0YXBcIiwgZnVuY3Rpb24gZnVsbHNjcmVlbigpIHtcbiAgICAgICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgICAgIGlmKCFwbGF5ZXIuaXNGdWxsc2NyZWVuKCkpe1xuICAgICAgICAgICAgLy9zZXQgdG8gZnVsbHNjcmVlblxuICAgICAgICAgICAgcGxheWVyLmlzRnVsbHNjcmVlbih0cnVlKTtcbiAgICAgICAgICAgIHBsYXllci5lbnRlckZ1bGxXaW5kb3coKTtcbiAgICAgICAgICAgIHJlc2l6ZUZuKCk7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImRldmljZW1vdGlvblwiLCByZXNpemVGbik7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcGxheWVyLmlzRnVsbHNjcmVlbihmYWxzZSk7XG4gICAgICAgICAgICBwbGF5ZXIuZXhpdEZ1bGxXaW5kb3coKTtcbiAgICAgICAgICAgIHBsYXllci5lbCgpLnN0eWxlLndpZHRoID0gXCJcIjtcbiAgICAgICAgICAgIHBsYXllci5lbCgpLnN0eWxlLmhlaWdodCA9IFwiXCI7XG4gICAgICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImRldmljZW1vdGlvblwiLCByZXNpemVGbik7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0byBpbnZva2Ugd2hlbiB0aGUgcGxheWVyIGlzIHJlYWR5LlxuICpcbiAqIFRoaXMgaXMgYSBncmVhdCBwbGFjZSBmb3IgeW91ciBwbHVnaW4gdG8gaW5pdGlhbGl6ZSBpdHNlbGYuIFdoZW4gdGhpc1xuICogZnVuY3Rpb24gaXMgY2FsbGVkLCB0aGUgcGxheWVyIHdpbGwgaGF2ZSBpdHMgRE9NIGFuZCBjaGlsZCBjb21wb25lbnRzXG4gKiBpbiBwbGFjZS5cbiAqXG4gKiBAZnVuY3Rpb24gb25QbGF5ZXJSZWFkeVxuICogQHBhcmFtICAgIHtQbGF5ZXJ9IHBsYXllclxuICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICovXG5jb25zdCBvblBsYXllclJlYWR5ID0gKHBsYXllciwgb3B0aW9ucywgc2V0dGluZ3MpID0+IHtcbiAgICBwbGF5ZXIuYWRkQ2xhc3MoJ3Zqcy1wYW5vcmFtYScpO1xuICAgIGlmKCFEZXRlY3Rvci53ZWJnbCl7XG4gICAgICAgIFBvcHVwTm90aWZpY2F0aW9uKHBsYXllciwge1xuICAgICAgICAgICAgTm90aWNlTWVzc2FnZTogRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKSxcbiAgICAgICAgICAgIGF1dG9IaWRlTm90aWNlOiBvcHRpb25zLmF1dG9IaWRlTm90aWNlXG4gICAgICAgIH0pO1xuICAgICAgICBpZihvcHRpb25zLmNhbGxiYWNrKXtcbiAgICAgICAgICAgIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHBsYXllci5hZGRDaGlsZCgnQ2FudmFzJywgdXRpbC5kZWVwQ29weShvcHRpb25zKSk7XG4gICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgaWYocnVuT25Nb2JpbGUpe1xuICAgICAgICB2YXIgdmlkZW9FbGVtZW50ID0gc2V0dGluZ3MuZ2V0VGVjaChwbGF5ZXIpO1xuICAgICAgICBpZih1dGlsLmlzUmVhbElwaG9uZSgpKXtcbiAgICAgICAgICAgIC8vaW9zIDEwIHN1cHBvcnQgcGxheSB2aWRlbyBpbmxpbmVcbiAgICAgICAgICAgIHZpZGVvRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJwbGF5c2lubGluZVwiLCBcIlwiKTtcbiAgICAgICAgICAgIG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lKHZpZGVvRWxlbWVudCwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodXRpbC5pc0lvcygpKXtcbiAgICAgICAgICAgIGZ1bGxzY3JlZW5PbklPUyhwbGF5ZXIsIHNldHRpbmdzLmdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuKHBsYXllcikpO1xuICAgICAgICB9XG4gICAgICAgIHBsYXllci5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvXCIpO1xuICAgICAgICBwbGF5ZXIucmVtb3ZlQ2xhc3MoXCJ2anMtdXNpbmctbmF0aXZlLWNvbnRyb2xzXCIpO1xuICAgICAgICBjYW52YXMucGxheU9uTW9iaWxlKCk7XG4gICAgfVxuICAgIGlmKG9wdGlvbnMuc2hvd05vdGljZSl7XG4gICAgICAgIHBsYXllci5vbihcInBsYXlpbmdcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIFBvcHVwTm90aWZpY2F0aW9uKHBsYXllciwgdXRpbC5kZWVwQ29weShvcHRpb25zKSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpZihvcHRpb25zLlZSRW5hYmxlKXtcbiAgICAgICAgcGxheWVyLmNvbnRyb2xCYXIuYWRkQ2hpbGQoJ1ZSQnV0dG9uJywge30sIHBsYXllci5jb250cm9sQmFyLmNoaWxkcmVuKCkubGVuZ3RoIC0gMSk7XG4gICAgfVxuICAgIGNhbnZhcy5oaWRlKCk7XG4gICAgcGxheWVyLm9uKFwicGxheVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5zaG93KCk7XG4gICAgfSk7XG4gICAgcGxheWVyLm9uKFwiZnVsbHNjcmVlbmNoYW5nZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICB9KTtcbiAgICBpZihvcHRpb25zLmNhbGxiYWNrKSBvcHRpb25zLmNhbGxiYWNrKCk7XG59O1xuXG5jb25zdCBQb3B1cE5vdGlmaWNhdGlvbiA9IChwbGF5ZXIsIG9wdGlvbnMgPSB7XG4gICAgTm90aWNlTWVzc2FnZTogXCJcIlxufSkgPT4ge1xuICAgIHZhciBub3RpY2UgPSBwbGF5ZXIuYWRkQ2hpbGQoJ05vdGljZScsIG9wdGlvbnMpO1xuXG4gICAgaWYob3B0aW9ucy5hdXRvSGlkZU5vdGljZSA+IDApe1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIG5vdGljZS5hZGRDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgIHZhciB0cmFuc2l0aW9uRXZlbnQgPSB1dGlsLndoaWNoVHJhbnNpdGlvbkV2ZW50KCk7XG4gICAgICAgICAgICB2YXIgaGlkZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5yZW1vdmVDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgICAgICBub3RpY2Uub2ZmKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgbm90aWNlLm9uKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgIH0sIG9wdGlvbnMuYXV0b0hpZGVOb3RpY2UpO1xuICAgIH1cbn07XG5cbmNvbnN0IHBsdWdpbiA9IGZ1bmN0aW9uKHNldHRpbmdzID0ge30pe1xuICAgIC8qKlxuICAgICAqIEEgdmlkZW8uanMgcGx1Z2luLlxuICAgICAqXG4gICAgICogSW4gdGhlIHBsdWdpbiBmdW5jdGlvbiwgdGhlIHZhbHVlIG9mIGB0aGlzYCBpcyBhIHZpZGVvLmpzIGBQbGF5ZXJgXG4gICAgICogaW5zdGFuY2UuIFlvdSBjYW5ub3QgcmVseSBvbiB0aGUgcGxheWVyIGJlaW5nIGluIGEgXCJyZWFkeVwiIHN0YXRlIGhlcmUsXG4gICAgICogZGVwZW5kaW5nIG9uIGhvdyB0aGUgcGx1Z2luIGlzIGludm9rZWQuIFRoaXMgbWF5IG9yIG1heSBub3QgYmUgaW1wb3J0YW50XG4gICAgICogdG8geW91OyBpZiBub3QsIHJlbW92ZSB0aGUgd2FpdCBmb3IgXCJyZWFkeVwiIVxuICAgICAqXG4gICAgICogQGZ1bmN0aW9uIHBhbm9yYW1hXG4gICAgICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICAgICAqICAgICAgICAgICBBbiBvYmplY3Qgb2Ygb3B0aW9ucyBsZWZ0IHRvIHRoZSBwbHVnaW4gYXV0aG9yIHRvIGRlZmluZS5cbiAgICAgKi9cbiAgICBjb25zdCB2aWRlb1R5cGVzID0gW1wiZXF1aXJlY3Rhbmd1bGFyXCIsIFwiZmlzaGV5ZVwiLCBcIjNkVmlkZW9cIiwgXCJkdWFsX2Zpc2hleWVcIl07XG4gICAgY29uc3QgcGFub3JhbWEgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIGlmKHNldHRpbmdzLm1lcmdlT3B0aW9uKSBvcHRpb25zID0gc2V0dGluZ3MubWVyZ2VPcHRpb24oZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgICAgICBpZih0eXBlb2Ygc2V0dGluZ3MuX2luaXQgPT09IFwidW5kZWZpbmVkXCIgfHwgdHlwZW9mIHNldHRpbmdzLl9pbml0ICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJwbHVnaW4gbXVzdCBpbXBsZW1lbnQgaW5pdCBmdW5jdGlvbigpLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZih2aWRlb1R5cGVzLmluZGV4T2Yob3B0aW9ucy52aWRlb1R5cGUpID09IC0xKSBvcHRpb25zLnZpZGVvVHlwZSA9IGRlZmF1bHRzLnZpZGVvVHlwZTtcbiAgICAgICAgc2V0dGluZ3MuX2luaXQob3B0aW9ucyk7XG4gICAgICAgIC8qIGltcGxlbWVudCBjYWxsYmFjayBmdW5jdGlvbiB3aGVuIHZpZGVvanMgaXMgcmVhZHkgKi9cbiAgICAgICAgdGhpcy5yZWFkeSgoKSA9PiB7XG4gICAgICAgICAgICBvblBsYXllclJlYWR5KHRoaXMsIG9wdGlvbnMsIHNldHRpbmdzKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuLy8gSW5jbHVkZSB0aGUgdmVyc2lvbiBudW1iZXIuXG4gICAgcGFub3JhbWEuVkVSU0lPTiA9ICcwLjEuNSc7XG5cbiAgICByZXR1cm4gcGFub3JhbWE7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBwbHVnaW47XG4iLCIndXNlIHN0cmljdCc7XG5cbmltcG9ydCBDYW52YXMgIGZyb20gJy4vbGliL0NhbnZhcyc7XG5pbXBvcnQgVGhyZWVEQ2FudmFzIGZyb20gJy4vbGliL1RocmVlQ2FudmFzJztcbmltcG9ydCBOb3RpY2UgIGZyb20gJy4vbGliL05vdGljZSc7XG5pbXBvcnQgSGVscGVyQ2FudmFzIGZyb20gJy4vbGliL0hlbHBlckNhbnZhcyc7XG5pbXBvcnQgVlJCdXR0b24gZnJvbSAnLi9saWIvVlJCdXR0b24nO1xuaW1wb3J0IHBhbm9yYW1hIGZyb20gJy4vcGx1Z2luJztcblxuZnVuY3Rpb24gZ2V0VGVjaChwbGF5ZXIpIHtcbiAgICByZXR1cm4gcGxheWVyLnRlY2goeyBJV2lsbE5vdFVzZVRoaXNJblBsdWdpbnM6IHRydWUgfSkuZWwoKTtcbn1cblxuZnVuY3Rpb24gZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSB7XG4gICAgcmV0dXJuIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUuaGFuZGxlQ2xpY2tcbn1cblxudmFyIGNvbXBvbmVudCA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KCdDb21wb25lbnQnKTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnTm90aWNlJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBub3RpY2UpKTtcblxudmFyIGhlbHBlckNhbnZhcyA9IEhlbHBlckNhbnZhcyhjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnSGVscGVyQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBoZWxwZXJDYW52YXMpKTtcblxudmFyIGJ1dHRvbiA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KFwiQnV0dG9uXCIpO1xudmFyIHZyQnRuID0gVlJCdXR0b24oYnV0dG9uKTtcbnZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ1ZSQnV0dG9uJywgdmlkZW9qcy5leHRlbmQoYnV0dG9uLCB2ckJ0bikpO1xuXG4vLyBSZWdpc3RlciB0aGUgcGx1Z2luIHdpdGggdmlkZW8uanMuXG52aWRlb2pzLnBsdWdpbigncGFub3JhbWEnLCBwYW5vcmFtYSh7XG4gICAgX2luaXQ6IGZ1bmN0aW9uKG9wdGlvbnMpe1xuICAgICAgICB2YXIgY2FudmFzID0gKG9wdGlvbnMudmlkZW9UeXBlICE9PSBcIjNkVmlkZW9cIik/XG4gICAgICAgICAgICBDYW52YXMoY29tcG9uZW50LCB3aW5kb3cuVEhSRUUsIHtcbiAgICAgICAgICAgICAgICBnZXRUZWNoOiBnZXRUZWNoXG4gICAgICAgICAgICB9KSA6XG4gICAgICAgICAgICBUaHJlZURDYW52YXMoY29tcG9uZW50LCB3aW5kb3cuVEhSRUUsIHtcbiAgICAgICAgICAgICAgICBnZXRUZWNoOiBnZXRUZWNoXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgdmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBjYW52YXMpKTtcbiAgICB9LFxuICAgIG1lcmdlT3B0aW9uOiBmdW5jdGlvbiAoZGVmYXVsdHMsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHZpZGVvanMubWVyZ2VPcHRpb25zKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICB9LFxuICAgIGdldFRlY2g6IGdldFRlY2gsXG4gICAgZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm46IGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuXG59KSk7XG4iXX0=
