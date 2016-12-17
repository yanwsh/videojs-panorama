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
                    width: this.width,
                    height: this.height
                });
                var context = this.helperCanvas.el();
                this.texture = new THREE.Texture(context);
            } else {
                this.texture = new THREE.Texture(video);
            }

            video.style.display = "none";

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
            this.on('touchmove', this.handleMouseMove.bind(this));
            this.on('mousedown', this.handleMouseDown.bind(this));
            this.on('touchstart', this.handleMouseDown.bind(this));
            this.on('mouseup', this.handleMouseUp.bind(this));
            this.on('touchend', this.handleMouseUp.bind(this));
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

},{"../lib/Detector":6,"../lib/MobileBuffering":8}],5:[function(require,module,exports){
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
            if ((currentVideoSource.type == "application/x-mpegURL" || currentVideoSource.type == "application/vnd.apple.mpegurl") && /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor)) {
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

            //define scene
            this.scene = new THREE.Scene();
            var aspectRatio = this.width / this.height / 2;
            //define camera
            this.cameraL = new THREE.PerspectiveCamera(options.initFov, aspectRatio, 1, 2000);
            this.cameraL.target = new THREE.Vector3(0, 0, 0);

            this.cameraR = new THREE.PerspectiveCamera(options.initFov, aspectRatio, 1, 2000);
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
            this.scene.add(this.meshR);

            if (options.callback) options.callback();
        },

        handleResize: function handleResize() {
            parent.handleResize.call(this);
            var aspectRatio = this.width / this.height / 2;
            this.cameraL.aspect = aspectRatio;
            this.cameraR.aspect = aspectRatio;
            this.cameraL.updateProjectionMatrix();
            this.cameraR.updateProjectionMatrix();
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
            this.cameraR.fov = this.cameraL.fov;
            this.cameraL.updateProjectionMatrix();
            this.cameraR.updateProjectionMatrix();
        },

        render: function render() {
            parent.render.call(this);
            var viewPortWidth = this.width / 2,
                viewPortHeight = this.height;
            this.cameraL.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
            this.cameraL.target.y = 500 * Math.cos(this.phi);
            this.cameraL.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
            this.cameraL.lookAt(this.cameraL.target);

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

exports.default = {
    whichTransitionEvent: whichTransitionEvent,
    mobileAndTabletcheck: mobileAndTabletcheck,
    isIos: isIos,
    isRealIphone: isRealIphone,
    fovToProjection: fovToProjection,
    extend: extend,
    deepCopy: deepCopy
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

    closePanorama: false

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
    if (options.VREnable && options.videoType !== "3dVideo") {
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
    var videoTypes = ["equirectangular", "fisheye", "3dVideo"];
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
    panorama.VERSION = '0.1.3';

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
    return player.tech ? player.tech.el() : player.h.el();
}

function getFullscreenToggleClickFn(player) {
    return player.controlBar.fullscreenToggle.onClick || player.controlBar.fullscreenToggle.u;
}

var component = videojs.Component;
var compatiableInitialFunction = function compatiableInitialFunction(player, options) {
    this.constructor(player, options);
};

var notice = (0, _Notice2.default)(component);
notice.init = compatiableInitialFunction;
videojs.Notice = component.extend(notice);

var helperCanvas = (0, _HelperCanvas2.default)(component);
helperCanvas.init = compatiableInitialFunction;
videojs.HelperCanvas = component.extend(helperCanvas);

var button = videojs.Button;
var vrBtn = (0, _VRButton2.default)(button);
vrBtn.init = compatiableInitialFunction;
vrBtn.onClick = vrBtn.u = vrBtn.handleClick;
vrBtn.buttonText = vrBtn.ta = vrBtn.controlText_;
vrBtn.T = function () {
    return 'vjs-VR-control ' + button.prototype.T.call(this);
};
videojs.VRButton = button.extend(vrBtn);

// Register the plugin with video.js.
videojs.plugin('panorama', (0, _plugin2.default)({
    _init: function _init(options) {
        var canvas = options.videoType !== "3dVideo" ? (0, _Canvas2.default)(component, window.THREE, {
            getTech: getTech
        }) : (0, _ThreeCanvas2.default)(component, window.THREE, {
            getTech: getTech
        });
        canvas.init = compatiableInitialFunction;
        videojs.Canvas = component.extend(canvas);
    },
    mergeOption: function mergeOption(defaults, options) {
        return videojs.util.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));

},{"./lib/Canvas":5,"./lib/HelperCanvas":7,"./lib/Notice":9,"./lib/ThreeCanvas":10,"./lib/VRButton":12,"./plugin":13}]},{},[14])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaW50ZXJ2YWxvbWV0ZXIvZGlzdC9pbnRlcnZhbG9tZXRlci5jb21tb24tanMuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwibm9kZV9tb2R1bGVzL3Bvb3ItbWFucy1zeW1ib2wvZGlzdC9wb29yLW1hbnMtc3ltYm9sLmNvbW1vbi1qcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9CYXNlQ2FudmFzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9UaHJlZUNhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvbGliL1ZSQnV0dG9uLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7Ozs7Ozs7O0FBUUE7Ozs7OztBQUVBOzs7O0FBQ0E7Ozs7OztBQUVBLElBQU0sb0JBQW9CLENBQTFCOztBQUVBLElBQUksYUFBYSxTQUFiLFVBQWEsQ0FBVSxhQUFWLEVBQXlCLEtBQXpCLEVBQStDO0FBQUEsUUFBZixRQUFlLHVFQUFKLEVBQUk7O0FBQzVELFdBQU87QUFDSCxxQkFBYSxTQUFTLElBQVQsQ0FBYyxNQUFk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TyxJQUFQLEdBQWMsMEJBQWQ7QUFDQSxnQkFBUSxNQUFSLEdBQWlCLFVBQVUsTUFBVixDQUFpQixNQUFqQixDQUFqQjtBQUNILEtBWCtCO0FBWWhDLGlCQUFhLHFCQUFVLFFBQVYsRUFBb0IsT0FBcEIsRUFBNkI7QUFDdEMsZUFBTyxRQUFRLElBQVIsQ0FBYSxZQUFiLENBQTBCLFFBQTFCLEVBQW9DLE9BQXBDLENBQVA7QUFDSCxLQWQrQjtBQWVoQyxhQUFTLE9BZnVCO0FBZ0JoQyxnQ0FBNEI7QUFoQkksQ0FBVCxDQUEzQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiEgbnBtLmltL2ludGVydmFsb21ldGVyICovXG4ndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG5cbmZ1bmN0aW9uIGludGVydmFsb21ldGVyKGNiLCByZXF1ZXN0LCBjYW5jZWwsIHJlcXVlc3RQYXJhbWV0ZXIpIHtcblx0dmFyIHJlcXVlc3RJZDtcblx0dmFyIHByZXZpb3VzTG9vcFRpbWU7XG5cdGZ1bmN0aW9uIGxvb3Aobm93KSB7XG5cdFx0Ly8gbXVzdCBiZSByZXF1ZXN0ZWQgYmVmb3JlIGNiKCkgYmVjYXVzZSB0aGF0IG1pZ2h0IGNhbGwgLnN0b3AoKVxuXHRcdHJlcXVlc3RJZCA9IHJlcXVlc3QobG9vcCwgcmVxdWVzdFBhcmFtZXRlcik7XG5cblx0XHQvLyBjYWxsZWQgd2l0aCBcIm1zIHNpbmNlIGxhc3QgY2FsbFwiLiAwIG9uIHN0YXJ0KClcblx0XHRjYihub3cgLSAocHJldmlvdXNMb29wVGltZSB8fCBub3cpKTtcblxuXHRcdHByZXZpb3VzTG9vcFRpbWUgPSBub3c7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzdGFydDogZnVuY3Rpb24gc3RhcnQoKSB7XG5cdFx0XHRpZiAoIXJlcXVlc3RJZCkgeyAvLyBwcmV2ZW50IGRvdWJsZSBzdGFydHNcblx0XHRcdFx0bG9vcCgwKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHN0b3A6IGZ1bmN0aW9uIHN0b3AoKSB7XG5cdFx0XHRjYW5jZWwocmVxdWVzdElkKTtcblx0XHRcdHJlcXVlc3RJZCA9IG51bGw7XG5cdFx0XHRwcmV2aW91c0xvb3BUaW1lID0gMDtcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGZyYW1lSW50ZXJ2YWxvbWV0ZXIoY2IpIHtcblx0cmV0dXJuIGludGVydmFsb21ldGVyKGNiLCByZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIGNhbmNlbEFuaW1hdGlvbkZyYW1lKTtcbn1cblxuZnVuY3Rpb24gdGltZXJJbnRlcnZhbG9tZXRlcihjYiwgZGVsYXkpIHtcblx0cmV0dXJuIGludGVydmFsb21ldGVyKGNiLCBzZXRUaW1lb3V0LCBjbGVhclRpbWVvdXQsIGRlbGF5KTtcbn1cblxuZXhwb3J0cy5pbnRlcnZhbG9tZXRlciA9IGludGVydmFsb21ldGVyO1xuZXhwb3J0cy5mcmFtZUludGVydmFsb21ldGVyID0gZnJhbWVJbnRlcnZhbG9tZXRlcjtcbmV4cG9ydHMudGltZXJJbnRlcnZhbG9tZXRlciA9IHRpbWVySW50ZXJ2YWxvbWV0ZXI7IiwiLyohIG5wbS5pbS9pcGhvbmUtaW5saW5lLXZpZGVvICovXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wRGVmYXVsdCAoZXgpIHsgcmV0dXJuIChleCAmJiAodHlwZW9mIGV4ID09PSAnb2JqZWN0JykgJiYgJ2RlZmF1bHQnIGluIGV4KSA/IGV4WydkZWZhdWx0J10gOiBleDsgfVxuXG52YXIgU3ltYm9sID0gX2ludGVyb3BEZWZhdWx0KHJlcXVpcmUoJ3Bvb3ItbWFucy1zeW1ib2wnKSk7XG52YXIgaW50ZXJ2YWxvbWV0ZXIgPSByZXF1aXJlKCdpbnRlcnZhbG9tZXRlcicpO1xuXG5mdW5jdGlvbiBwcmV2ZW50RXZlbnQoZWxlbWVudCwgZXZlbnROYW1lLCB0b2dnbGVQcm9wZXJ0eSwgcHJldmVudFdpdGhQcm9wZXJ0eSkge1xuXHRmdW5jdGlvbiBoYW5kbGVyKGUpIHtcblx0XHRpZiAoQm9vbGVhbihlbGVtZW50W3RvZ2dsZVByb3BlcnR5XSkgPT09IEJvb2xlYW4ocHJldmVudFdpdGhQcm9wZXJ0eSkpIHtcblx0XHRcdGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHQvLyBjb25zb2xlLmxvZyhldmVudE5hbWUsICdwcmV2ZW50ZWQgb24nLCBlbGVtZW50KTtcblx0XHR9XG5cdFx0ZGVsZXRlIGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldO1xuXHR9XG5cdGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGhhbmRsZXIsIGZhbHNlKTtcblxuXHQvLyBSZXR1cm4gaGFuZGxlciB0byBhbGxvdyB0byBkaXNhYmxlIHRoZSBwcmV2ZW50aW9uLiBVc2FnZTpcblx0Ly8gY29uc3QgcHJldmVudGlvbkhhbmRsZXIgPSBwcmV2ZW50RXZlbnQoZWwsICdjbGljaycpO1xuXHQvLyBlbC5yZW1vdmVFdmVudEhhbmRsZXIoJ2NsaWNrJywgcHJldmVudGlvbkhhbmRsZXIpO1xuXHRyZXR1cm4gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcHJveHlQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwgc291cmNlT2JqZWN0LCBjb3B5Rmlyc3QpIHtcblx0ZnVuY3Rpb24gZ2V0KCkge1xuXHRcdHJldHVybiBzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXTtcblx0fVxuXHRmdW5jdGlvbiBzZXQodmFsdWUpIHtcblx0XHRzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXSA9IHZhbHVlO1xuXHR9XG5cblx0aWYgKGNvcHlGaXJzdCkge1xuXHRcdHNldChvYmplY3RbcHJvcGVydHlOYW1lXSk7XG5cdH1cblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHtnZXQ6IGdldCwgc2V0OiBzZXR9KTtcbn1cblxuZnVuY3Rpb24gcHJveHlFdmVudChvYmplY3QsIGV2ZW50TmFtZSwgc291cmNlT2JqZWN0KSB7XG5cdHNvdXJjZU9iamVjdC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gb2JqZWN0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KGV2ZW50TmFtZSkpOyB9KTtcbn1cblxuZnVuY3Rpb24gZGlzcGF0Y2hFdmVudEFzeW5jKGVsZW1lbnQsIHR5cGUpIHtcblx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0ZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCh0eXBlKSk7XG5cdH0pO1xufVxuXG4vLyBpT1MgMTAgYWRkcyBzdXBwb3J0IGZvciBuYXRpdmUgaW5saW5lIHBsYXliYWNrICsgc2lsZW50IGF1dG9wbGF5XG52YXIgaXNXaGl0ZWxpc3RlZCA9IC9pUGhvbmV8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkgJiYgIW1hdGNoTWVkaWEoJygtd2Via2l0LXZpZGVvLXBsYXlhYmxlLWlubGluZSknKS5tYXRjaGVzO1xuXG52YXIg4LKgID0gU3ltYm9sKCk7XG52YXIg4LKgZXZlbnQgPSBTeW1ib2woKTtcbnZhciDgsqBwbGF5ID0gU3ltYm9sKCduYXRpdmVwbGF5Jyk7XG52YXIg4LKgcGF1c2UgPSBTeW1ib2woJ25hdGl2ZXBhdXNlJyk7XG5cbi8qKlxuICogVVRJTFNcbiAqL1xuXG5mdW5jdGlvbiBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbykge1xuXHR2YXIgYXVkaW8gPSBuZXcgQXVkaW8oKTtcblx0cHJveHlFdmVudCh2aWRlbywgJ3BsYXknLCBhdWRpbyk7XG5cdHByb3h5RXZlbnQodmlkZW8sICdwbGF5aW5nJywgYXVkaW8pO1xuXHRwcm94eUV2ZW50KHZpZGVvLCAncGF1c2UnLCBhdWRpbyk7XG5cdGF1ZGlvLmNyb3NzT3JpZ2luID0gdmlkZW8uY3Jvc3NPcmlnaW47XG5cblx0Ly8gJ2RhdGE6JyBjYXVzZXMgYXVkaW8ubmV0d29ya1N0YXRlID4gMFxuXHQvLyB3aGljaCB0aGVuIGFsbG93cyB0byBrZWVwIDxhdWRpbz4gaW4gYSByZXN1bWFibGUgcGxheWluZyBzdGF0ZVxuXHQvLyBpLmUuIG9uY2UgeW91IHNldCBhIHJlYWwgc3JjIGl0IHdpbGwga2VlcCBwbGF5aW5nIGlmIGl0IHdhcyBpZiAucGxheSgpIHdhcyBjYWxsZWRcblx0YXVkaW8uc3JjID0gdmlkZW8uc3JjIHx8IHZpZGVvLmN1cnJlbnRTcmMgfHwgJ2RhdGE6JztcblxuXHQvLyBpZiAoYXVkaW8uc3JjID09PSAnZGF0YTonKSB7XG5cdC8vICAgVE9ETzogd2FpdCBmb3IgdmlkZW8gdG8gYmUgc2VsZWN0ZWRcblx0Ly8gfVxuXHRyZXR1cm4gYXVkaW87XG59XG5cbnZhciBsYXN0UmVxdWVzdHMgPSBbXTtcbnZhciByZXF1ZXN0SW5kZXggPSAwO1xudmFyIGxhc3RUaW1ldXBkYXRlRXZlbnQ7XG5cbmZ1bmN0aW9uIHNldFRpbWUodmlkZW8sIHRpbWUsIHJlbWVtYmVyT25seSkge1xuXHQvLyBhbGxvdyBvbmUgdGltZXVwZGF0ZSBldmVudCBldmVyeSAyMDArIG1zXG5cdGlmICgobGFzdFRpbWV1cGRhdGVFdmVudCB8fCAwKSArIDIwMCA8IERhdGUubm93KCkpIHtcblx0XHR2aWRlb1vgsqBldmVudF0gPSB0cnVlO1xuXHRcdGxhc3RUaW1ldXBkYXRlRXZlbnQgPSBEYXRlLm5vdygpO1xuXHR9XG5cdGlmICghcmVtZW1iZXJPbmx5KSB7XG5cdFx0dmlkZW8uY3VycmVudFRpbWUgPSB0aW1lO1xuXHR9XG5cdGxhc3RSZXF1ZXN0c1srK3JlcXVlc3RJbmRleCAlIDNdID0gdGltZSAqIDEwMCB8IDAgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIGlzUGxheWVyRW5kZWQocGxheWVyKSB7XG5cdHJldHVybiBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID49IHBsYXllci52aWRlby5kdXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gdXBkYXRlKHRpbWVEaWZmKSB7XG5cdHZhciBwbGF5ZXIgPSB0aGlzO1xuXHQvLyBjb25zb2xlLmxvZygndXBkYXRlJywgcGxheWVyLnZpZGVvLnJlYWR5U3RhdGUsIHBsYXllci52aWRlby5uZXR3b3JrU3RhdGUsIHBsYXllci5kcml2ZXIucmVhZHlTdGF0ZSwgcGxheWVyLmRyaXZlci5uZXR3b3JrU3RhdGUsIHBsYXllci5kcml2ZXIucGF1c2VkKTtcblx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0ZVVFVSRV9EQVRBKSB7XG5cdFx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSBwbGF5ZXIudmlkZW8uY3VycmVudFRpbWUgKyAoKHRpbWVEaWZmICogcGxheWVyLnZpZGVvLnBsYXliYWNrUmF0ZSkgLyAxMDAwKTtcblx0XHRcdGlmIChwbGF5ZXIudmlkZW8ubG9vcCAmJiBpc1BsYXllckVuZGVkKHBsYXllcikpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNldFRpbWUocGxheWVyLnZpZGVvLCBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lKTtcblx0fSBlbHNlIGlmIChwbGF5ZXIudmlkZW8ubmV0d29ya1N0YXRlID09PSBwbGF5ZXIudmlkZW8uTkVUV09SS19JRExFICYmICFwbGF5ZXIudmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0Ly8gdGhpcyBzaG91bGQgaGFwcGVuIHdoZW4gdGhlIHNvdXJjZSBpcyBhdmFpbGFibGUgYnV0OlxuXHRcdC8vIC0gaXQncyBwb3RlbnRpYWxseSBwbGF5aW5nICgucGF1c2VkID09PSBmYWxzZSlcblx0XHQvLyAtIGl0J3Mgbm90IHJlYWR5IHRvIHBsYXlcblx0XHQvLyAtIGl0J3Mgbm90IGxvYWRpbmdcblx0XHQvLyBJZiBpdCBoYXNBdWRpbywgdGhhdCB3aWxsIGJlIGxvYWRlZCBpbiB0aGUgJ2VtcHRpZWQnIGhhbmRsZXIgYmVsb3dcblx0XHRwbGF5ZXIudmlkZW8ubG9hZCgpO1xuXHRcdC8vIGNvbnNvbGUubG9nKCdXaWxsIGxvYWQnKTtcblx0fVxuXG5cdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci52aWRlby5jdXJyZW50VGltZSA9PT0gcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSwgJ1ZpZGVvIG5vdCB1cGRhdGluZyEnKTtcblxuXHRpZiAocGxheWVyLnZpZGVvLmVuZGVkKSB7XG5cdFx0ZGVsZXRlIHBsYXllci52aWRlb1vgsqBldmVudF07IC8vIGFsbG93IHRpbWV1cGRhdGUgZXZlbnRcblx0XHRwbGF5ZXIudmlkZW8ucGF1c2UodHJ1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBNRVRIT0RTXG4gKi9cblxuZnVuY3Rpb24gcGxheSgpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BsYXknKTtcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB1c2UgdGhlIG5hdGl2ZSBwbGF5ZXJcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAocGxheWVyLmRyaXZlci5zcmMgIT09ICdkYXRhOicgJiYgcGxheWVyLmRyaXZlci5zcmMgIT09IHZpZGVvLnNyYykge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdzcmMgY2hhbmdlZCBvbiBwbGF5JywgdmlkZW8uc3JjKTtcblx0XHRzZXRUaW1lKHZpZGVvLCAwLCB0cnVlKTtcblx0XHRwbGF5ZXIuZHJpdmVyLnNyYyA9IHZpZGVvLnNyYztcblx0fVxuXG5cdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHBsYXllci5wYXVzZWQgPSBmYWxzZTtcblxuXHRpZiAoIXZpZGVvLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdC8vIC5sb2FkKCkgY2F1c2VzIHRoZSBlbXB0aWVkIGV2ZW50XG5cdFx0Ly8gdGhlIGFsdGVybmF0aXZlIGlzIC5wbGF5KCkrLnBhdXNlKCkgYnV0IHRoYXQgdHJpZ2dlcnMgcGxheS9wYXVzZSBldmVudHMsIGV2ZW4gd29yc2Vcblx0XHQvLyBwb3NzaWJseSB0aGUgYWx0ZXJuYXRpdmUgaXMgcHJldmVudGluZyB0aGlzIGV2ZW50IG9ubHkgb25jZVxuXHRcdHZpZGVvLmxvYWQoKTtcblx0fVxuXG5cdHBsYXllci5kcml2ZXIucGxheSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdGFydCgpO1xuXG5cdGlmICghcGxheWVyLmhhc0F1ZGlvKSB7XG5cdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGxheScpO1xuXHRcdGlmIChwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSA+PSBwbGF5ZXIudmlkZW8uSEFWRV9FTk9VR0hfREFUQSkge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ29ucGxheScpO1xuXHRcdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGxheWluZycpO1xuXHRcdH1cblx0fVxufVxuZnVuY3Rpb24gcGF1c2UoZm9yY2VFdmVudHMpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BhdXNlJyk7XG5cdHZhciB2aWRlbyA9IHRoaXM7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXG5cdHBsYXllci5kcml2ZXIucGF1c2UoKTtcblx0cGxheWVyLnVwZGF0ZXIuc3RvcCgpO1xuXG5cdC8vIGlmIGl0J3MgZnVsbHNjcmVlbiwgdGhlIGRldmVsb3BlciB0aGUgbmF0aXZlIHBsYXllci5wYXVzZSgpXG5cdC8vIFRoaXMgaXMgYXQgdGhlIGVuZCBvZiBwYXVzZSgpIGJlY2F1c2UgaXQgYWxzb1xuXHQvLyBuZWVkcyB0byBtYWtlIHN1cmUgdGhhdCB0aGUgc2ltdWxhdGlvbiBpcyBwYXVzZWRcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGF1c2VdKCk7XG5cdH1cblxuXHRpZiAocGxheWVyLnBhdXNlZCAmJiAhZm9yY2VFdmVudHMpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwbGF5ZXIucGF1c2VkID0gdHJ1ZTtcblx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwYXVzZScpO1xuXHR9XG5cdGlmICh2aWRlby5lbmRlZCkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAnZW5kZWQnKTtcblx0fVxufVxuXG4vKipcbiAqIFNFVFVQXG4gKi9cblxuZnVuY3Rpb24gYWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXSA9IHt9O1xuXHRwbGF5ZXIucGF1c2VkID0gdHJ1ZTsgLy8gdHJhY2sgd2hldGhlciAncGF1c2UnIGV2ZW50cyBoYXZlIGJlZW4gZmlyZWRcblx0cGxheWVyLmhhc0F1ZGlvID0gaGFzQXVkaW87XG5cdHBsYXllci52aWRlbyA9IHZpZGVvO1xuXHRwbGF5ZXIudXBkYXRlciA9IGludGVydmFsb21ldGVyLmZyYW1lSW50ZXJ2YWxvbWV0ZXIodXBkYXRlLmJpbmQocGxheWVyKSk7XG5cblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0cGxheWVyLmRyaXZlciA9IGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKTtcblx0fSBlbHNlIHtcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ29uY2FucGxheScpO1xuXHRcdFx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5aW5nJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cGxheWVyLmRyaXZlciA9IHtcblx0XHRcdHNyYzogdmlkZW8uc3JjIHx8IHZpZGVvLmN1cnJlbnRTcmMgfHwgJ2RhdGE6Jyxcblx0XHRcdG11dGVkOiB0cnVlLFxuXHRcdFx0cGF1c2VkOiB0cnVlLFxuXHRcdFx0cGF1c2U6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdHBsYXk6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSBmYWxzZTtcblx0XHRcdFx0Ly8gbWVkaWEgYXV0b21hdGljYWxseSBnb2VzIHRvIDAgaWYgLnBsYXkoKSBpcyBjYWxsZWQgd2hlbiBpdCdzIGRvbmVcblx0XHRcdFx0aWYgKGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRcdHNldFRpbWUodmlkZW8sIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGVuZGVkKCkge1xuXHRcdFx0XHRyZXR1cm4gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyAubG9hZCgpIGNhdXNlcyB0aGUgZW1wdGllZCBldmVudFxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbXB0aWVkJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdkcml2ZXIgc3JjIGlzJywgcGxheWVyLmRyaXZlci5zcmMpO1xuXHRcdHZhciB3YXNFbXB0eSA9ICFwbGF5ZXIuZHJpdmVyLnNyYyB8fCBwbGF5ZXIuZHJpdmVyLnNyYyA9PT0gJ2RhdGE6Jztcblx0XHRpZiAocGxheWVyLmRyaXZlci5zcmMgJiYgcGxheWVyLmRyaXZlci5zcmMgIT09IHZpZGVvLnNyYykge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkIHRvJywgdmlkZW8uc3JjKTtcblx0XHRcdHNldFRpbWUodmlkZW8sIDAsIHRydWUpO1xuXHRcdFx0cGxheWVyLmRyaXZlci5zcmMgPSB2aWRlby5zcmM7XG5cdFx0XHQvLyBwbGF5aW5nIHZpZGVvcyB3aWxsIG9ubHkga2VlcCBwbGF5aW5nIGlmIG5vIHNyYyB3YXMgcHJlc2VudCB3aGVuIC5wbGF5KCnigJllZFxuXHRcdFx0aWYgKHdhc0VtcHR5KSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGxheSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGxheWVyLnVwZGF0ZXIuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSwgZmFsc2UpO1xuXG5cdC8vIHN0b3AgcHJvZ3JhbW1hdGljIHBsYXllciB3aGVuIE9TIHRha2VzIG92ZXJcblx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0YmVnaW5mdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdGhhdCB0aGUgPGF1ZGlvPiBhbmQgdGhlIHN5bmNlci91cGRhdGVyIGFyZSBzdG9wcGVkXG5cdFx0XHR2aWRlby5wYXVzZSgpO1xuXG5cdFx0XHQvLyBwbGF5IHZpZGVvIG5hdGl2ZWx5XG5cdFx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdH0gZWxzZSBpZiAoaGFzQXVkaW8gJiYgIXBsYXllci5kcml2ZXIuYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0XHQvLyBpZiB0aGUgZmlyc3QgcGxheSBpcyBuYXRpdmUsXG5cdFx0XHQvLyB0aGUgPGF1ZGlvPiBuZWVkcyB0byBiZSBidWZmZXJlZCBtYW51YWxseVxuXHRcdFx0Ly8gc28gd2hlbiB0aGUgZnVsbHNjcmVlbiBlbmRzLCBpdCBjYW4gYmUgc2V0IHRvIHRoZSBzYW1lIGN1cnJlbnQgdGltZVxuXHRcdFx0cGxheWVyLmRyaXZlci5sb2FkKCk7XG5cdFx0fVxuXHR9KTtcblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0ZW5kZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIHN5bmMgYXVkaW8gdG8gbmV3IHZpZGVvIHBvc2l0aW9uXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHQvLyBjb25zb2xlLmFzc2VydChwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID09PSB2aWRlby5jdXJyZW50VGltZSwgJ0F1ZGlvIG5vdCBzeW5jZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIGFsbG93IHNlZWtpbmdcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVraW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKGxhc3RSZXF1ZXN0cy5pbmRleE9mKHZpZGVvLmN1cnJlbnRUaW1lICogMTAwIHwgMCAvIDEwMCkgPCAwKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdVc2VyLXJlcXVlc3RlZCBzZWVraW5nJyk7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBvdmVybG9hZEFQSSh2aWRlbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblx0dmlkZW9b4LKgcGxheV0gPSB2aWRlby5wbGF5O1xuXHR2aWRlb1vgsqBwYXVzZV0gPSB2aWRlby5wYXVzZTtcblx0dmlkZW8ucGxheSA9IHBsYXk7XG5cdHZpZGVvLnBhdXNlID0gcGF1c2U7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwYXVzZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ211dGVkJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwbGF5YmFja1JhdGUnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2VuZGVkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdsb29wJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtpbmcnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2VkJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3RpbWV1cGRhdGUnLCDgsqBldmVudCwgZmFsc2UpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdlbmRlZCcsIOCyoGV2ZW50LCBmYWxzZSk7IC8vIHByZXZlbnQgb2NjYXNpb25hbCBuYXRpdmUgZW5kZWQgZXZlbnRzXG59XG5cbmZ1bmN0aW9uIGVuYWJsZUlubGluZVZpZGVvKHZpZGVvLCBoYXNBdWRpbywgb25seVdoaXRlbGlzdGVkKSB7XG5cdGlmICggaGFzQXVkaW8gPT09IHZvaWQgMCApIGhhc0F1ZGlvID0gdHJ1ZTtcblx0aWYgKCBvbmx5V2hpdGVsaXN0ZWQgPT09IHZvaWQgMCApIG9ubHlXaGl0ZWxpc3RlZCA9IHRydWU7XG5cblx0aWYgKChvbmx5V2hpdGVsaXN0ZWQgJiYgIWlzV2hpdGVsaXN0ZWQpIHx8IHZpZGVvW+CyoF0pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbyk7XG5cdG92ZXJsb2FkQVBJKHZpZGVvKTtcblx0dmlkZW8uY2xhc3NMaXN0LmFkZCgnSUlWJyk7XG5cdGlmICghaGFzQXVkaW8gJiYgdmlkZW8uYXV0b3BsYXkpIHtcblx0XHR2aWRlby5wbGF5KCk7XG5cdH1cblx0aWYgKCEvaVBob25lfGlQb2R8aVBhZC8udGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pKSB7XG5cdFx0Y29uc29sZS53YXJuKCdpcGhvbmUtaW5saW5lLXZpZGVvIGlzIG5vdCBndWFyYW50ZWVkIHRvIHdvcmsgaW4gZW11bGF0ZWQgZW52aXJvbm1lbnRzJyk7XG5cdH1cbn1cblxuZW5hYmxlSW5saW5lVmlkZW8uaXNXaGl0ZWxpc3RlZCA9IGlzV2hpdGVsaXN0ZWQ7XG5cbm1vZHVsZS5leHBvcnRzID0gZW5hYmxlSW5saW5lVmlkZW87IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgaW5kZXggPSB0eXBlb2YgU3ltYm9sID09PSAndW5kZWZpbmVkJyA/IGZ1bmN0aW9uIChkZXNjcmlwdGlvbikge1xuXHRyZXR1cm4gJ0AnICsgKGRlc2NyaXB0aW9uIHx8ICdAJykgKyBNYXRoLnJhbmRvbSgpO1xufSA6IFN5bWJvbDtcblxubW9kdWxlLmV4cG9ydHMgPSBpbmRleDsiLCIvKipcbiAqXG4gKiAoYykgV2Vuc2hlbmcgWWFuIDx5YW53c2hAZ21haWwuY29tPlxuICogRGF0ZTogMTAvMzAvMTZcbiAqXG4gKiBGb3IgdGhlIGZ1bGwgY29weXJpZ2h0IGFuZCBsaWNlbnNlIGluZm9ybWF0aW9uLCBwbGVhc2UgdmlldyB0aGUgTElDRU5TRVxuICogZmlsZSB0aGF0IHdhcyBkaXN0cmlidXRlZCB3aXRoIHRoaXMgc291cmNlIGNvZGUuXG4gKi9cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IERldGVjdG9yIGZyb20gJy4uL2xpYi9EZXRlY3Rvcic7XG5pbXBvcnQgTW9iaWxlQnVmZmVyaW5nIGZyb20gJy4uL2xpYi9Nb2JpbGVCdWZmZXJpbmcnO1xuXG5jb25zdCBIQVZFX0NVUlJFTlRfREFUQSA9IDI7XG5cbnZhciBCYXNlQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBvcHRpb25zO1xuICAgICAgICAgICAgLy9iYXNpYyBzZXR0aW5nc1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHBsYXllci5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMubG9uID0gb3B0aW9ucy5pbml0TG9uLCB0aGlzLmxhdCA9IG9wdGlvbnMuaW5pdExhdCwgdGhpcy5waGkgPSAwLCB0aGlzLnRoZXRhID0gMDtcbiAgICAgICAgICAgIHRoaXMudmlkZW9UeXBlID0gb3B0aW9ucy52aWRlb1R5cGU7XG4gICAgICAgICAgICB0aGlzLmNsaWNrVG9Ub2dnbGUgPSBvcHRpb25zLmNsaWNrVG9Ub2dnbGU7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvL2RlZmluZSByZW5kZXJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmF1dG9DbGVhciA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDbGVhckNvbG9yKDB4MDAwMDAwLCAxKTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgdGV4dHVyZSwgb24gaWUgMTEsIHdlIG5lZWQgYWRkaXRpb25hbCBoZWxwZXIgY2FudmFzIHRvIHNvbHZlIHJlbmRlcmluZyBpc3N1ZS5cbiAgICAgICAgICAgIHZhciB2aWRlbyA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcbiAgICAgICAgICAgIHRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSA9IERldGVjdG9yLnN1cHBvcnRWaWRlb1RleHR1cmUoKTtcbiAgICAgICAgICAgIHRoaXMubGl2ZVN0cmVhbU9uU2FmYXJpID0gRGV0ZWN0b3IuaXNMaXZlU3RyZWFtT25TYWZhcmkodmlkZW8pO1xuICAgICAgICAgICAgaWYodGhpcy5saXZlU3RyZWFtT25TYWZhcmkpIHRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSA9IGZhbHNlO1xuICAgICAgICAgICAgaWYoIXRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oZWxwZXJDYW52YXMgPSBwbGF5ZXIuYWRkQ2hpbGQoXCJIZWxwZXJDYW52YXNcIiwge1xuICAgICAgICAgICAgICAgICAgICB2aWRlbzogdmlkZW8sXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiB0aGlzLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRleHQgPSB0aGlzLmhlbHBlckNhbnZhcy5lbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKGNvbnRleHQpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUodmlkZW8pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2aWRlby5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5cbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUubWF4RmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcblxuICAgICAgICAgICAgdGhpcy5lbF8gPSB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmVsXy5jbGFzc0xpc3QuYWRkKCd2anMtdmlkZW8tY2FudmFzJyk7XG5cbiAgICAgICAgICAgIG9wdGlvbnMuZWwgPSB0aGlzLmVsXztcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB0aGlzLmF0dGFjaENvbnRyb2xFdmVudHMoKTtcbiAgICAgICAgICAgIHRoaXMucGxheWVyKCkub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGUoKTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXR0YWNoQ29udHJvbEV2ZW50czogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2htb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoc3RhcnQnLHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2V1cCcsIHRoaXMuaGFuZGxlTW91c2VVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoZW5kJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5zY3JvbGxhYmxlKXtcbiAgICAgICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXdoZWVsJywgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWVudGVyJywgdGhpcy5oYW5kbGVNb3VzZUVudGVyLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2VsZWF2ZScsIHRoaXMuaGFuZGxlTW91c2VMZWFzZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLnBsYXllcigpLmVsKCkub2Zmc2V0V2lkdGgsIHRoaXMuaGVpZ2h0ID0gdGhpcy5wbGF5ZXIoKS5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSggdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVVwOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IGZhbHNlO1xuICAgICAgICAgICAgaWYodGhpcy5jbGlja1RvVG9nZ2xlKXtcbiAgICAgICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQuY2hhbmdlZFRvdWNoZXMgJiYgZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQuY2hhbmdlZFRvdWNoZXMgJiYgZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YgY2xpZW50WCA9PT0gXCJ1bmRlZmluZWRcIiB8fCBjbGllbnRZID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICAgICAgdmFyIGRpZmZYID0gTWF0aC5hYnMoY2xpZW50WCAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYKTtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlkgPSBNYXRoLmFicyhjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkpO1xuICAgICAgICAgICAgICAgIGlmKGRpZmZYIDwgMC4xICYmIGRpZmZZIDwgMC4xKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLnBhdXNlZCgpID8gdGhpcy5wbGF5ZXIoKS5wbGF5KCkgOiB0aGlzLnBsYXllcigpLnBhdXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VEb3duOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgaWYodHlwZW9mIGNsaWVudFggPT09IFwidW5kZWZpbmVkXCIgfHwgY2xpZW50WSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclggPSBjbGllbnRYO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkgPSBjbGllbnRZO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duTG9uID0gdGhpcy5sb247XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25MYXQgPSB0aGlzLmxhdDtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZU1vdmU6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuY2xpY2tBbmREcmFnKXtcbiAgICAgICAgICAgICAgICBpZih0aGlzLm1vdXNlRG93bil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKCB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCAtIGNsaWVudFggKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxvbjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoIGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTGF0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHZhciB4ID0gZXZlbnQucGFnZVggLSB0aGlzLmVsXy5vZmZzZXRMZWZ0O1xuICAgICAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucGFnZVkgLSB0aGlzLmVsXy5vZmZzZXRUb3A7XG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoeCAvIHRoaXMud2lkdGgpICogNDMwIC0gMjI1O1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKHkgLyB0aGlzLmhlaWdodCkgKiAtMTgwICsgOTA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW9iaWxlT3JpZW50YXRpb246IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgaWYodHlwZW9mIGV2ZW50LnJvdGF0aW9uUmF0ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIHggPSBldmVudC5yb3RhdGlvblJhdGUuYWxwaGE7XG4gICAgICAgICAgICB2YXIgeSA9IGV2ZW50LnJvdGF0aW9uUmF0ZS5iZXRhO1xuICAgICAgICAgICAgdmFyIHBvcnRyYWl0ID0gKHR5cGVvZiBldmVudC5wb3J0cmFpdCAhPT0gXCJ1bmRlZmluZWRcIik/IGV2ZW50LnBvcnRyYWl0IDogd2luZG93Lm1hdGNoTWVkaWEoXCIob3JpZW50YXRpb246IHBvcnRyYWl0KVwiKS5tYXRjaGVzO1xuICAgICAgICAgICAgdmFyIGxhbmRzY2FwZSA9ICh0eXBlb2YgZXZlbnQubGFuZHNjYXBlICE9PSBcInVuZGVmaW5lZFwiKT8gZXZlbnQubGFuZHNjYXBlIDogd2luZG93Lm1hdGNoTWVkaWEoXCIob3JpZW50YXRpb246IGxhbmRzY2FwZSlcIikubWF0Y2hlcztcbiAgICAgICAgICAgIHZhciBvcmllbnRhdGlvbiA9IGV2ZW50Lm9yaWVudGF0aW9uIHx8IHdpbmRvdy5vcmllbnRhdGlvbjtcblxuICAgICAgICAgICAgaWYgKHBvcnRyYWl0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSB0aGlzLmxvbiAtIHkgKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gdGhpcy5sYXQgKyB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgIH1lbHNlIGlmKGxhbmRzY2FwZSl7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGF0aW9uRGVncmVlID0gLTkwO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiBvcmllbnRhdGlvbiAhPSBcInVuZGVmaW5lZFwiKXtcbiAgICAgICAgICAgICAgICAgICAgb3JpZW50YXRpb25EZWdyZWUgPSBvcmllbnRhdGlvbjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IChvcmllbnRhdGlvbkRlZ3JlZSA9PSAtOTApPyB0aGlzLmxvbiArIHggKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlIDogdGhpcy5sb24gLSB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IChvcmllbnRhdGlvbkRlZ3JlZSA9PSAtOTApPyB0aGlzLmxhdCArIHkgKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlIDogdGhpcy5sYXQgLSB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VFbnRlcjogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUxlYXNlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBhbmltYXRlOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0QW5pbWF0aW9uSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoIHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpICk7XG4gICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIoKS5wYXVzZWQoKSl7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHRoaXMudGV4dHVyZSkgIT09IFwidW5kZWZpbmVkXCIgJiYgKCF0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyKCkucmVhZHlTdGF0ZSgpID49IEhBVkVfQ1VSUkVOVF9EQVRBIHx8IHRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wbGF5aW5nXCIpKSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3QgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN0IC0gdGhpcy50aW1lID49IDMwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lID0gY3Q7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5pc1BsYXlPbk1vYmlsZSl7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudFRpbWUgPSB0aGlzLnBsYXllcigpLmN1cnJlbnRUaW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihNb2JpbGVCdWZmZXJpbmcuaXNCdWZmZXJpbmcoY3VycmVudFRpbWUpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkuYWRkQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkucmVtb3ZlQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBpZighdGhpcy5pc1VzZXJJbnRlcmFjdGluZyl7XG4gICAgICAgICAgICAgICAgdmFyIHN5bWJvbExhdCA9ICh0aGlzLmxhdCA+IHRoaXMuc2V0dGluZ3MuaW5pdExhdCk/ICAtMSA6IDE7XG4gICAgICAgICAgICAgICAgdmFyIHN5bWJvbExvbiA9ICh0aGlzLmxvbiA+IHRoaXMuc2V0dGluZ3MuaW5pdExvbik/ICAtMSA6IDE7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5iYWNrVG9WZXJ0aWNhbENlbnRlcil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPiAodGhpcy5zZXR0aW5ncy5pbml0TGF0IC0gTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0KSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0IDwgKHRoaXMuc2V0dGluZ3MuaW5pdExhdCArIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCkpXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMuc2V0dGluZ3MuaW5pdExhdCA6IHRoaXMubGF0ICsgdGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0ICogc3ltYm9sTGF0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmJhY2tUb0hvcml6b25DZW50ZXIpe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IChcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID4gKHRoaXMuc2V0dGluZ3MuaW5pdExvbiAtIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbikpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA8ICh0aGlzLnNldHRpbmdzLmluaXRMb24gKyBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24pKVxuICAgICAgICAgICAgICAgICAgICApPyB0aGlzLnNldHRpbmdzLmluaXRMb24gOiB0aGlzLmxvbiArIHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbiAqIHN5bWJvbExvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmxhdCA9IE1hdGgubWF4KCB0aGlzLnNldHRpbmdzLm1pbkxhdCwgTWF0aC5taW4oIHRoaXMuc2V0dGluZ3MubWF4TGF0LCB0aGlzLmxhdCApICk7XG4gICAgICAgICAgICB0aGlzLmxvbiA9IE1hdGgubWF4KCB0aGlzLnNldHRpbmdzLm1pbkxvbiwgTWF0aC5taW4oIHRoaXMuc2V0dGluZ3MubWF4TG9uLCB0aGlzLmxvbiApICk7XG4gICAgICAgICAgICB0aGlzLnBoaSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIDkwIC0gdGhpcy5sYXQgKTtcbiAgICAgICAgICAgIHRoaXMudGhldGEgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCB0aGlzLmxvbiApO1xuXG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhlbHBlckNhbnZhcy51cGRhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuY2xlYXIoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBwbGF5T25Nb2JpbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaXNQbGF5T25Nb2JpbGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5hdXRvTW9iaWxlT3JpZW50YXRpb24pXG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZW1vdGlvbicsIHRoaXMuaGFuZGxlTW9iaWxlT3JpZW50YXRpb24uYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lbF87XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBCYXNlQ2FudmFzO1xuIiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzMvMTYuXG4gKi9cblxuaW1wb3J0IEJhc2VDYW52YXMgZnJvbSAnLi9CYXNlQ2FudmFzJztcbmltcG9ydCBVdGlsIGZyb20gJy4vVXRpbCc7XG5cbnZhciBDYW52YXMgPSBmdW5jdGlvbiAoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzID0ge30pIHtcbiAgICB2YXIgcGFyZW50ID0gQmFzZUNhbnZhcyhiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MpO1xuXG4gICAgcmV0dXJuIFV0aWwuZXh0ZW5kKHBhcmVudCwge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgcGFyZW50LmNvbnN0cnVjdG9yLmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vZGVmaW5lIHNjZW5lXG4gICAgICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG4gICAgICAgICAgICAvL2RlZmluZSBjYW1lcmFcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAwLCAwLCAwICk7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIGdlb21ldHJ5XG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnkgPSAodGhpcy52aWRlb1R5cGUgPT09IFwiZXF1aXJlY3Rhbmd1bGFyXCIpPyBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoNTAwLCA2MCwgNDApOiBuZXcgVEhSRUUuU3BoZXJlQnVmZmVyR2VvbWV0cnkoIDUwMCwgNjAsIDQwICkudG9Ob25JbmRleGVkKCk7XG4gICAgICAgICAgICBpZih0aGlzLnZpZGVvVHlwZSA9PT0gXCJmaXNoZXllXCIpe1xuICAgICAgICAgICAgICAgIHZhciBub3JtYWxzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICAgICAgdmFyIHV2cyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICAgICAgZm9yICggdmFyIGkgPSAwLCBsID0gbm9ybWFscy5sZW5ndGggLyAzOyBpIDwgbDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHggPSBub3JtYWxzWyBpICogMyArIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHkgPSBub3JtYWxzWyBpICogMyArIDEgXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHogPSBub3JtYWxzWyBpICogMyArIDIgXTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgciA9IE1hdGguYXNpbihNYXRoLnNxcnQoeCAqIHggKyB6ICogeikgLyBNYXRoLnNxcnQoeCAqIHggICsgeSAqIHkgKyB6ICogeikpIC8gTWF0aC5QSTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeSA8IDApIHIgPSAxIC0gcjtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRoZXRhID0gKHggPT0gMCAmJiB6ID09IDApPyAwIDogTWF0aC5hY29zKHggLyBNYXRoLnNxcnQoeCAqIHggKyB6ICogeikpO1xuICAgICAgICAgICAgICAgICAgICBpZih6IDwgMCkgdGhldGEgPSB0aGV0YSAqIC0xO1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMCBdID0gLTAuOCAqIHIgKiBNYXRoLmNvcyh0aGV0YSkgKyAwLjU7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAxIF0gPSAwLjggKiByICogTWF0aC5zaW4odGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVYKCBvcHRpb25zLnJvdGF0ZVgpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVkoIG9wdGlvbnMucm90YXRlWSk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWiggb3B0aW9ucy5yb3RhdGVaKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdlb21ldHJ5LnNjYWxlKCAtIDEsIDEsIDEgKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIG1lc2hcbiAgICAgICAgICAgIHRoaXMubWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LFxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvL3RoaXMubWVzaC5zY2FsZS54ID0gLTE7XG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLm1lc2gpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVuYWJsZVZSOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IHRydWU7XG4gICAgICAgICAgICBpZih0eXBlb2YgdnJITUQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgICAgICAgICB2YXIgZXllUGFyYW1zTCA9IHZySE1ELmdldEV5ZVBhcmFtZXRlcnMoICdsZWZ0JyApO1xuICAgICAgICAgICAgICAgIHZhciBleWVQYXJhbXNSID0gdnJITUQuZ2V0RXllUGFyYW1ldGVycyggJ3JpZ2h0JyApO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5leWVGT1ZMID0gZXllUGFyYW1zTC5yZWNvbW1lbmRlZEZpZWxkT2ZWaWV3O1xuICAgICAgICAgICAgICAgIHRoaXMuZXllRk9WUiA9IGV5ZVBhcmFtc1IucmVjb21tZW5kZWRGaWVsZE9mVmlldztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKHRoaXMuY2FtZXJhLmZvdiwgdGhpcy53aWR0aCAvMiAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUiA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSh0aGlzLmNhbWVyYS5mb3YsIHRoaXMud2lkdGggLzIgLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZGlzYWJsZVZSOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3NvciggMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVSZXNpemUuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIGlmKHRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZU1vdXNlV2hlZWwoZXZlbnQpO1xuICAgICAgICAgICAgLy8gV2ViS2l0XG4gICAgICAgICAgICBpZiAoIGV2ZW50LndoZWVsRGVsdGFZICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBGaXJlZm94XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC5kZXRhaWwgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ICs9IGV2ZW50LmRldGFpbCAqIDEuMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5tYXgodGhpcy5zZXR0aW5ncy5taW5Gb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICBpZih0aGlzLlZSTW9kZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IHRoaXMuY2FtZXJhLmZvdjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuZm92ID0gdGhpcy5jYW1lcmEuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBwYXJlbnQucmVuZGVyLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC55ID0gNTAwICogTWF0aC5jb3MoIHRoaXMucGhpICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmxvb2tBdCggdGhpcy5jYW1lcmEudGFyZ2V0ICk7XG5cbiAgICAgICAgICAgIGlmKCF0aGlzLlZSTW9kZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgIHZhciB2aWV3UG9ydFdpZHRoID0gdGhpcy53aWR0aCAvIDIsIHZpZXdQb3J0SGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIHZySE1EICE9PSAndW5kZWZpbmVkJyl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5wcm9qZWN0aW9uTWF0cml4ID0gVXRpbC5mb3ZUb1Byb2plY3Rpb24oIHRoaXMuZXllRk9WTCwgdHJ1ZSwgdGhpcy5jYW1lcmEubmVhciwgdGhpcy5jYW1lcmEuZmFyICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5wcm9qZWN0aW9uTWF0cml4ID0gVXRpbC5mb3ZUb1Byb2plY3Rpb24oIHRoaXMuZXllRk9WUiwgdHJ1ZSwgdGhpcy5jYW1lcmEubmVhciwgdGhpcy5jYW1lcmEuZmFyICk7XG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb25MID0gdGhpcy5sb24gKyB0aGlzLnNldHRpbmdzLlZSR2FwRGVncmVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbG9uUiA9IHRoaXMubG9uIC0gdGhpcy5zZXR0aW5ncy5WUkdhcERlZ3JlZTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgdGhldGFMID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggbG9uTCApO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGhldGFSID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggbG9uUiApO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0YXJnZXRMID0gVXRpbC5kZWVwQ29weSh0aGlzLmNhbWVyYS50YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMLnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGV0YUwgKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0TC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhldGFMICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5sb29rQXQodGFyZ2V0TCk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldFIgPSBVdGlsLmRlZXBDb3B5KHRoaXMuY2FtZXJhLnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFIueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoZXRhUiApO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRSLnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGV0YVIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmxvb2tBdCh0YXJnZXRSKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIGxlZnQgZXllXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhTCApO1xuXG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIHJpZ2h0IGV5ZVxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYVIgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgQ2FudmFzO1xuIiwiLyoqXG4gKiBAYXV0aG9yIGFsdGVyZWRxIC8gaHR0cDovL2FsdGVyZWRxdWFsaWEuY29tL1xuICogQGF1dGhvciBtci5kb29iIC8gaHR0cDovL21yZG9vYi5jb20vXG4gKi9cblxudmFyIERldGVjdG9yID0ge1xuXG4gICAgY2FudmFzOiAhISB3aW5kb3cuQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuICAgIHdlYmdsOiAoIGZ1bmN0aW9uICgpIHtcblxuICAgICAgICB0cnkge1xuXG4gICAgICAgICAgICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggJ2NhbnZhcycgKTsgcmV0dXJuICEhICggd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCAmJiAoIGNhbnZhcy5nZXRDb250ZXh0KCAnd2ViZ2wnICkgfHwgY2FudmFzLmdldENvbnRleHQoICdleHBlcmltZW50YWwtd2ViZ2wnICkgKSApO1xuXG4gICAgICAgIH0gY2F0Y2ggKCBlICkge1xuXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgfVxuXG4gICAgfSApKCksXG4gICAgd29ya2VyczogISEgd2luZG93LldvcmtlcixcbiAgICBmaWxlYXBpOiB3aW5kb3cuRmlsZSAmJiB3aW5kb3cuRmlsZVJlYWRlciAmJiB3aW5kb3cuRmlsZUxpc3QgJiYgd2luZG93LkJsb2IsXG5cbiAgICAgQ2hlY2tfVmVyc2lvbjogZnVuY3Rpb24oKSB7XG4gICAgICAgICB2YXIgcnYgPSAtMTsgLy8gUmV0dXJuIHZhbHVlIGFzc3VtZXMgZmFpbHVyZS5cblxuICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBOYW1lID09ICdNaWNyb3NvZnQgSW50ZXJuZXQgRXhwbG9yZXInKSB7XG5cbiAgICAgICAgICAgICB2YXIgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50LFxuICAgICAgICAgICAgICAgICByZSA9IG5ldyBSZWdFeHAoXCJNU0lFIChbMC05XXsxLH1bXFxcXC4wLTldezAsfSlcIik7XG5cbiAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgcnYgPSBwYXJzZUZsb2F0KFJlZ0V4cC4kMSk7XG4gICAgICAgICAgICAgfVxuICAgICAgICAgfVxuICAgICAgICAgZWxzZSBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gXCJOZXRzY2FwZVwiKSB7XG4gICAgICAgICAgICAgLy8vIGluIElFIDExIHRoZSBuYXZpZ2F0b3IuYXBwVmVyc2lvbiBzYXlzICd0cmlkZW50J1xuICAgICAgICAgICAgIC8vLyBpbiBFZGdlIHRoZSBuYXZpZ2F0b3IuYXBwVmVyc2lvbiBkb2VzIG5vdCBzYXkgdHJpZGVudFxuICAgICAgICAgICAgIGlmIChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKCdUcmlkZW50JykgIT09IC0xKSBydiA9IDExO1xuICAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgIHZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQ7XG4gICAgICAgICAgICAgICAgIHZhciByZSA9IG5ldyBSZWdFeHAoXCJFZGdlXFwvKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcbiAgICAgICAgICAgICAgICAgaWYgKHJlLmV4ZWModWEpICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICBydiA9IHBhcnNlRmxvYXQoUmVnRXhwLiQxKTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgIH1cblxuICAgICAgICAgcmV0dXJuIHJ2O1xuICAgICB9LFxuXG4gICAgc3VwcG9ydFZpZGVvVGV4dHVyZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAvL2llIDExIGFuZCBlZGdlIDEyIGRvZXNuJ3Qgc3VwcG9ydCB2aWRlbyB0ZXh0dXJlLlxuICAgICAgICB2YXIgdmVyc2lvbiA9IHRoaXMuQ2hlY2tfVmVyc2lvbigpO1xuICAgICAgICByZXR1cm4gKHZlcnNpb24gPT09IC0xIHx8IHZlcnNpb24gPj0gMTMpO1xuICAgIH0sXG5cbiAgICBpc0xpdmVTdHJlYW1PblNhZmFyaTogZnVuY3Rpb24gKHZpZGVvRWxlbWVudCkge1xuICAgICAgICAvL2xpdmUgc3RyZWFtIG9uIHNhZmFyaSBkb2Vzbid0IHN1cHBvcnQgdmlkZW8gdGV4dHVyZVxuICAgICAgICB2YXIgdmlkZW9Tb3VyY2VzID0gdmlkZW9FbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoXCJzb3VyY2VcIik7XG4gICAgICAgIHZhciByZXN1bHQgPSBmYWxzZTtcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IHZpZGVvU291cmNlcy5sZW5ndGg7IGkrKyl7XG4gICAgICAgICAgICB2YXIgY3VycmVudFZpZGVvU291cmNlID0gdmlkZW9Tb3VyY2VzW2ldO1xuICAgICAgICAgICAgaWYoKGN1cnJlbnRWaWRlb1NvdXJjZS50eXBlID09IFwiYXBwbGljYXRpb24veC1tcGVnVVJMXCIgfHwgY3VycmVudFZpZGVvU291cmNlLnR5cGUgPT0gXCJhcHBsaWNhdGlvbi92bmQuYXBwbGUubXBlZ3VybFwiKSAmJiAvU2FmYXJpLy50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpICYmIC9BcHBsZSBDb21wdXRlci8udGVzdChuYXZpZ2F0b3IudmVuZG9yKSl7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIGdldFdlYkdMRXJyb3JNZXNzYWdlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgICAgICBlbGVtZW50LmlkID0gJ3dlYmdsLWVycm9yLW1lc3NhZ2UnO1xuXG4gICAgICAgIGlmICggISB0aGlzLndlYmdsICkge1xuXG4gICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgPyBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgZ3JhcGhpY3MgY2FyZCBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIgLz4nLFxuICAgICAgICAgICAgICAgICdGaW5kIG91dCBob3cgdG8gZ2V0IGl0IDxhIGhyZWY9XCJodHRwOi8vZ2V0LndlYmdsLm9yZy9cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5oZXJlPC9hPi4nXG4gICAgICAgICAgICBdLmpvaW4oICdcXG4nICkgOiBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgYnJvd3NlciBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG5cbiAgICB9LFxuXG4gICAgYWRkR2V0V2ViR0xNZXNzYWdlOiBmdW5jdGlvbiAoIHBhcmFtZXRlcnMgKSB7XG5cbiAgICAgICAgdmFyIHBhcmVudCwgaWQsIGVsZW1lbnQ7XG5cbiAgICAgICAgcGFyYW1ldGVycyA9IHBhcmFtZXRlcnMgfHwge307XG5cbiAgICAgICAgcGFyZW50ID0gcGFyYW1ldGVycy5wYXJlbnQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMucGFyZW50IDogZG9jdW1lbnQuYm9keTtcbiAgICAgICAgaWQgPSBwYXJhbWV0ZXJzLmlkICE9PSB1bmRlZmluZWQgPyBwYXJhbWV0ZXJzLmlkIDogJ29sZGllJztcblxuICAgICAgICBlbGVtZW50ID0gRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKTtcbiAgICAgICAgZWxlbWVudC5pZCA9IGlkO1xuXG4gICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCggZWxlbWVudCApO1xuXG4gICAgfVxuXG59O1xuXG5leHBvcnQgZGVmYXVsdCBEZXRlY3RvcjsiLCIvKipcbiAqIENyZWF0ZWQgYnkgd2Vuc2hlbmcueWFuIG9uIDUvMjMvMTYuXG4gKi9cbnZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5lbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLWhlbHBlci1jYW52YXNcIjtcblxudmFyIEhlbHBlckNhbnZhcyA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICB0aGlzLnZpZGVvRWxlbWVudCA9IG9wdGlvbnMudmlkZW87XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gb3B0aW9ucy53aWR0aDtcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XG5cbiAgICAgICAgICAgIGVsZW1lbnQud2lkdGggPSB0aGlzLndpZHRoO1xuICAgICAgICAgICAgZWxlbWVudC5oZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG5cblxuICAgICAgICAgICAgdGhpcy5jb250ZXh0ID0gZWxlbWVudC5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBnZXRDb250ZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dDsgIFxuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgSGVscGVyQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNi82LzE2LlxuICovXG52YXIgTW9iaWxlQnVmZmVyaW5nID0ge1xuICAgIHByZXZfY3VycmVudFRpbWU6IDAsXG4gICAgY291bnRlcjogMCxcbiAgICBcbiAgICBpc0J1ZmZlcmluZzogZnVuY3Rpb24gKGN1cnJlbnRUaW1lKSB7XG4gICAgICAgIGlmIChjdXJyZW50VGltZSA9PSB0aGlzLnByZXZfY3VycmVudFRpbWUpIHRoaXMuY291bnRlcisrO1xuICAgICAgICBlbHNlIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucHJldl9jdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICBpZih0aGlzLmNvdW50ZXIgPiAxMCl7XG4gICAgICAgICAgICAvL25vdCBsZXQgY291bnRlciBvdmVyZmxvd1xuICAgICAgICAgICAgdGhpcy5jb3VudGVyID0gMTA7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgTW9iaWxlQnVmZmVyaW5nOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC80LzE2LlxuICovXG5cbnZhciBOb3RpY2UgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcbiAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVsZW1lbnQuY2xhc3NOYW1lID0gXCJ2anMtdmlkZW8tbm90aWNlLWxhYmVsXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgaWYodHlwZW9mIG9wdGlvbnMuTm90aWNlTWVzc2FnZSA9PSBcIm9iamVjdFwiKXtcbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICB9ZWxzZSBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwic3RyaW5nXCIpe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBlbGVtZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBOb3RpY2U7IiwiLyoqXG4gKlxuICogKGMpIFdlbnNoZW5nIFlhbiA8eWFud3NoQGdtYWlsLmNvbT5cbiAqIERhdGU6IDEwLzIxLzE2XG4gKlxuICogRm9yIHRoZSBmdWxsIGNvcHlyaWdodCBhbmQgbGljZW5zZSBpbmZvcm1hdGlvbiwgcGxlYXNlIHZpZXcgdGhlIExJQ0VOU0VcbiAqIGZpbGUgdGhhdCB3YXMgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzIHNvdXJjZSBjb2RlLlxuICovXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCBCYXNlQ2FudmFzIGZyb20gJy4vQmFzZUNhbnZhcyc7XG5pbXBvcnQgVXRpbCBmcm9tICcuL1V0aWwnO1xuXG52YXIgVGhyZWVEQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KXtcbiAgICB2YXIgcGFyZW50ID0gQmFzZUNhbnZhcyhiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MpO1xuICAgIHJldHVybiBVdGlsLmV4dGVuZChwYXJlbnQsIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHBhcmVudC5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIHNjZW5lXG4gICAgICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG4gICAgICAgICAgICB2YXIgYXNwZWN0UmF0aW8gPSB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQgLyAyO1xuICAgICAgICAgICAgLy9kZWZpbmUgY2FtZXJhXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEob3B0aW9ucy5pbml0Rm92LCBhc3BlY3RSYXRpbywgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDAsIDAsIDAgKTtcblxuICAgICAgICAgICAgdGhpcy5jYW1lcmFSID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgYXNwZWN0UmF0aW8sIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnBvc2l0aW9uLnNldCggMTAwMCwgMCwgMCApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAxMDAwLCAwLCAwICk7XG5cbiAgICAgICAgICAgIHZhciBnZW9tZXRyeUwgPSBuZXcgVEhSRUUuU3BoZXJlQnVmZmVyR2VvbWV0cnkoNTAwLCA2MCwgNDApLnRvTm9uSW5kZXhlZCgpO1xuICAgICAgICAgICAgdmFyIGdlb21ldHJ5UiA9IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSg1MDAsIDYwLCA0MCkudG9Ob25JbmRleGVkKCk7XG5cbiAgICAgICAgICAgIHZhciB1dnNMID0gZ2VvbWV0cnlMLmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICB2YXIgbm9ybWFsc0wgPSBnZW9tZXRyeUwuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBub3JtYWxzTC5sZW5ndGggLyAzOyBpICsrICkge1xuICAgICAgICAgICAgICAgIHV2c0xbIGkgKiAyICsgMSBdID0gdXZzTFsgaSAqIDIgKyAxIF0gLyAyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdXZzUiA9IGdlb21ldHJ5Ui5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgdmFyIG5vcm1hbHNSID0gZ2VvbWV0cnlSLmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgZm9yICggdmFyIGkgPSAwOyBpIDwgbm9ybWFsc1IubGVuZ3RoIC8gMzsgaSArKyApIHtcbiAgICAgICAgICAgICAgICB1dnNSWyBpICogMiArIDEgXSA9IHV2c1JbIGkgKiAyICsgMSBdIC8gMiArIDAuNTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZ2VvbWV0cnlMLnNjYWxlKCAtIDEsIDEsIDEgKTtcbiAgICAgICAgICAgIGdlb21ldHJ5Ui5zY2FsZSggLSAxLCAxLCAxICk7XG5cbiAgICAgICAgICAgIHRoaXMubWVzaEwgPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeUwsXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0aGlzLnRleHR1cmV9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgdGhpcy5tZXNoUiA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5UixcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhpcy5tZXNoUi5wb3NpdGlvbi5zZXQoMTAwMCwgMCwgMCk7XG5cbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMubWVzaEwpO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoUik7XG5cbiAgICAgICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVSZXNpemUuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHZhciBhc3BlY3RSYXRpbyA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodCAvIDI7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gYXNwZWN0UmF0aW87XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIuYXNwZWN0ID0gYXNwZWN0UmF0aW87XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBwYXJlbnQuaGFuZGxlTW91c2VXaGVlbChldmVudCk7XG4gICAgICAgICAgICAvLyBXZWJLaXRcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gRmlyZWZveFxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQuZGV0YWlsICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgKz0gZXZlbnQuZGV0YWlsICogMS4wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYUwuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgPSBNYXRoLm1heCh0aGlzLnNldHRpbmdzLm1pbkZvdiwgdGhpcy5jYW1lcmFMLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIuZm92ID0gdGhpcy5jYW1lcmFMLmZvdjtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHBhcmVudC5yZW5kZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHZhciB2aWV3UG9ydFdpZHRoID0gdGhpcy53aWR0aCAvIDIsIHZpZXdQb3J0SGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0LnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5sb29rQXQodGhpcy5jYW1lcmFMLnRhcmdldCk7XG5cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi50YXJnZXQueCA9IDEwMDAgKyA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5sb29rQXQoIHRoaXMuY2FtZXJhUi50YXJnZXQgKTtcblxuICAgICAgICAgICAgLy8gcmVuZGVyIGxlZnQgZXllXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhTCApO1xuXG4gICAgICAgICAgICAvLyByZW5kZXIgcmlnaHQgZXllXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhUiApO1xuICAgICAgICB9XG4gICAgfSk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBUaHJlZURDYW52YXM7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA0LzQvMTYuXG4gKi9cbmZ1bmN0aW9uIHdoaWNoVHJhbnNpdGlvbkV2ZW50KCl7XG4gICAgdmFyIHQ7XG4gICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZmFrZWVsZW1lbnQnKTtcbiAgICB2YXIgdHJhbnNpdGlvbnMgPSB7XG4gICAgICAgICd0cmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdPVHJhbnNpdGlvbic6J29UcmFuc2l0aW9uRW5kJyxcbiAgICAgICAgJ01velRyYW5zaXRpb24nOid0cmFuc2l0aW9uZW5kJyxcbiAgICAgICAgJ1dlYmtpdFRyYW5zaXRpb24nOid3ZWJraXRUcmFuc2l0aW9uRW5kJ1xuICAgIH07XG5cbiAgICBmb3IodCBpbiB0cmFuc2l0aW9ucyl7XG4gICAgICAgIGlmKCBlbC5zdHlsZVt0XSAhPT0gdW5kZWZpbmVkICl7XG4gICAgICAgICAgICByZXR1cm4gdHJhbnNpdGlvbnNbdF07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1vYmlsZUFuZFRhYmxldGNoZWNrKCkge1xuICAgIHZhciBjaGVjayA9IGZhbHNlO1xuICAgIChmdW5jdGlvbihhKXtpZigvKGFuZHJvaWR8YmJcXGQrfG1lZWdvKS4rbW9iaWxlfGF2YW50Z298YmFkYVxcL3xibGFja2JlcnJ5fGJsYXplcnxjb21wYWx8ZWxhaW5lfGZlbm5lY3xoaXB0b3B8aWVtb2JpbGV8aXAoaG9uZXxvZCl8aXJpc3xraW5kbGV8bGdlIHxtYWVtb3xtaWRwfG1tcHxtb2JpbGUuK2ZpcmVmb3h8bmV0ZnJvbnR8b3BlcmEgbShvYnxpbilpfHBhbG0oIG9zKT98cGhvbmV8cChpeGl8cmUpXFwvfHBsdWNrZXJ8cG9ja2V0fHBzcHxzZXJpZXMoNHw2KTB8c3ltYmlhbnx0cmVvfHVwXFwuKGJyb3dzZXJ8bGluayl8dm9kYWZvbmV8d2FwfHdpbmRvd3MgY2V8eGRhfHhpaW5vfGFuZHJvaWR8aXBhZHxwbGF5Ym9va3xzaWxrL2kudGVzdChhKXx8LzEyMDd8NjMxMHw2NTkwfDNnc298NHRocHw1MFsxLTZdaXw3NzBzfDgwMnN8YSB3YXxhYmFjfGFjKGVyfG9vfHNcXC0pfGFpKGtvfHJuKXxhbChhdnxjYXxjbyl8YW1vaXxhbihleHxueXx5dyl8YXB0dXxhcihjaHxnbyl8YXModGV8dXMpfGF0dHd8YXUoZGl8XFwtbXxyIHxzICl8YXZhbnxiZShja3xsbHxucSl8YmkobGJ8cmQpfGJsKGFjfGF6KXxicihlfHYpd3xidW1ifGJ3XFwtKG58dSl8YzU1XFwvfGNhcGl8Y2N3YXxjZG1cXC18Y2VsbHxjaHRtfGNsZGN8Y21kXFwtfGNvKG1wfG5kKXxjcmF3fGRhKGl0fGxsfG5nKXxkYnRlfGRjXFwtc3xkZXZpfGRpY2F8ZG1vYnxkbyhjfHApb3xkcygxMnxcXC1kKXxlbCg0OXxhaSl8ZW0obDJ8dWwpfGVyKGljfGswKXxlc2w4fGV6KFs0LTddMHxvc3x3YXx6ZSl8ZmV0Y3xmbHkoXFwtfF8pfGcxIHV8ZzU2MHxnZW5lfGdmXFwtNXxnXFwtbW98Z28oXFwud3xvZCl8Z3IoYWR8dW4pfGhhaWV8aGNpdHxoZFxcLShtfHB8dCl8aGVpXFwtfGhpKHB0fHRhKXxocCggaXxpcCl8aHNcXC1jfGh0KGMoXFwtfCB8X3xhfGd8cHxzfHQpfHRwKXxodShhd3x0Yyl8aVxcLSgyMHxnb3xtYSl8aTIzMHxpYWMoIHxcXC18XFwvKXxpYnJvfGlkZWF8aWcwMXxpa29tfGltMWt8aW5ub3xpcGFxfGlyaXN8amEodHx2KWF8amJyb3xqZW11fGppZ3N8a2RkaXxrZWppfGtndCggfFxcLyl8a2xvbnxrcHQgfGt3Y1xcLXxreW8oY3xrKXxsZShub3x4aSl8bGcoIGd8XFwvKGt8bHx1KXw1MHw1NHxcXC1bYS13XSl8bGlid3xseW54fG0xXFwtd3xtM2dhfG01MFxcL3xtYSh0ZXx1aXx4byl8bWMoMDF8MjF8Y2EpfG1cXC1jcnxtZShyY3xyaSl8bWkobzh8b2F8dHMpfG1tZWZ8bW8oMDF8MDJ8Yml8ZGV8ZG98dChcXC18IHxvfHYpfHp6KXxtdCg1MHxwMXx2ICl8bXdicHxteXdhfG4xMFswLTJdfG4yMFsyLTNdfG4zMCgwfDIpfG41MCgwfDJ8NSl8bjcoMCgwfDEpfDEwKXxuZSgoY3xtKVxcLXxvbnx0Znx3Znx3Z3x3dCl8bm9rKDZ8aSl8bnpwaHxvMmltfG9wKHRpfHd2KXxvcmFufG93ZzF8cDgwMHxwYW4oYXxkfHQpfHBkeGd8cGcoMTN8XFwtKFsxLThdfGMpKXxwaGlsfHBpcmV8cGwoYXl8dWMpfHBuXFwtMnxwbyhja3xydHxzZSl8cHJveHxwc2lvfHB0XFwtZ3xxYVxcLWF8cWMoMDd8MTJ8MjF8MzJ8NjB8XFwtWzItN118aVxcLSl8cXRla3xyMzgwfHI2MDB8cmFrc3xyaW05fHJvKHZlfHpvKXxzNTVcXC98c2EoZ2V8bWF8bW18bXN8bnl8dmEpfHNjKDAxfGhcXC18b298cFxcLSl8c2RrXFwvfHNlKGMoXFwtfDB8MSl8NDd8bWN8bmR8cmkpfHNnaFxcLXxzaGFyfHNpZShcXC18bSl8c2tcXC0wfHNsKDQ1fGlkKXxzbShhbHxhcnxiM3xpdHx0NSl8c28oZnR8bnkpfHNwKDAxfGhcXC18dlxcLXx2ICl8c3koMDF8bWIpfHQyKDE4fDUwKXx0NigwMHwxMHwxOCl8dGEoZ3R8bGspfHRjbFxcLXx0ZGdcXC18dGVsKGl8bSl8dGltXFwtfHRcXC1tb3x0byhwbHxzaCl8dHMoNzB8bVxcLXxtM3xtNSl8dHhcXC05fHVwKFxcLmJ8ZzF8c2kpfHV0c3R8djQwMHx2NzUwfHZlcml8dmkocmd8dGUpfHZrKDQwfDVbMC0zXXxcXC12KXx2bTQwfHZvZGF8dnVsY3x2eCg1Mnw1M3w2MHw2MXw3MHw4MHw4MXw4M3w4NXw5OCl8dzNjKFxcLXwgKXx3ZWJjfHdoaXR8d2koZyB8bmN8bncpfHdtbGJ8d29udXx4NzAwfHlhc1xcLXx5b3VyfHpldG98enRlXFwtL2kudGVzdChhLnN1YnN0cigwLDQpKSljaGVjayA9IHRydWV9KShuYXZpZ2F0b3IudXNlckFnZW50fHxuYXZpZ2F0b3IudmVuZG9yfHx3aW5kb3cub3BlcmEpO1xuICAgIHJldHVybiBjaGVjaztcbn1cblxuZnVuY3Rpb24gaXNJb3MoKSB7XG4gICAgcmV0dXJuIC9pUGhvbmV8aVBhZHxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcbn1cblxuZnVuY3Rpb24gaXNSZWFsSXBob25lKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQb2QvaS50ZXN0KG5hdmlnYXRvci5wbGF0Zm9ybSk7XG59XG5cbi8vYWRvcHQgY29kZSBmcm9tOiBodHRwczovL2dpdGh1Yi5jb20vTW96VlIvdnItd2ViLWV4YW1wbGVzL2Jsb2IvbWFzdGVyL3RocmVlanMtdnItYm9pbGVycGxhdGUvanMvVlJFZmZlY3QuanNcbmZ1bmN0aW9uIGZvdlRvTkRDU2NhbGVPZmZzZXQoIGZvdiApIHtcbiAgICB2YXIgcHhzY2FsZSA9IDIuMCAvIChmb3YubGVmdFRhbiArIGZvdi5yaWdodFRhbik7XG4gICAgdmFyIHB4b2Zmc2V0ID0gKGZvdi5sZWZ0VGFuIC0gZm92LnJpZ2h0VGFuKSAqIHB4c2NhbGUgKiAwLjU7XG4gICAgdmFyIHB5c2NhbGUgPSAyLjAgLyAoZm92LnVwVGFuICsgZm92LmRvd25UYW4pO1xuICAgIHZhciBweW9mZnNldCA9IChmb3YudXBUYW4gLSBmb3YuZG93blRhbikgKiBweXNjYWxlICogMC41O1xuICAgIHJldHVybiB7IHNjYWxlOiBbIHB4c2NhbGUsIHB5c2NhbGUgXSwgb2Zmc2V0OiBbIHB4b2Zmc2V0LCBweW9mZnNldCBdIH07XG59XG5cbmZ1bmN0aW9uIGZvdlBvcnRUb1Byb2plY3Rpb24oIGZvdiwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICkge1xuXG4gICAgcmlnaHRIYW5kZWQgPSByaWdodEhhbmRlZCA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IHJpZ2h0SGFuZGVkO1xuICAgIHpOZWFyID0gek5lYXIgPT09IHVuZGVmaW5lZCA/IDAuMDEgOiB6TmVhcjtcbiAgICB6RmFyID0gekZhciA9PT0gdW5kZWZpbmVkID8gMTAwMDAuMCA6IHpGYXI7XG5cbiAgICB2YXIgaGFuZGVkbmVzc1NjYWxlID0gcmlnaHRIYW5kZWQgPyAtMS4wIDogMS4wO1xuXG4gICAgLy8gc3RhcnQgd2l0aCBhbiBpZGVudGl0eSBtYXRyaXhcbiAgICB2YXIgbW9iaiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gICAgdmFyIG0gPSBtb2JqLmVsZW1lbnRzO1xuXG4gICAgLy8gYW5kIHdpdGggc2NhbGUvb2Zmc2V0IGluZm8gZm9yIG5vcm1hbGl6ZWQgZGV2aWNlIGNvb3Jkc1xuICAgIHZhciBzY2FsZUFuZE9mZnNldCA9IGZvdlRvTkRDU2NhbGVPZmZzZXQoZm92KTtcblxuICAgIC8vIFggcmVzdWx0LCBtYXAgY2xpcCBlZGdlcyB0byBbLXcsK3ddXG4gICAgbVswICogNCArIDBdID0gc2NhbGVBbmRPZmZzZXQuc2NhbGVbMF07XG4gICAgbVswICogNCArIDFdID0gMC4wO1xuICAgIG1bMCAqIDQgKyAyXSA9IHNjYWxlQW5kT2Zmc2V0Lm9mZnNldFswXSAqIGhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzAgKiA0ICsgM10gPSAwLjA7XG5cbiAgICAvLyBZIHJlc3VsdCwgbWFwIGNsaXAgZWRnZXMgdG8gWy13LCt3XVxuICAgIC8vIFkgb2Zmc2V0IGlzIG5lZ2F0ZWQgYmVjYXVzZSB0aGlzIHByb2ogbWF0cml4IHRyYW5zZm9ybXMgZnJvbSB3b3JsZCBjb29yZHMgd2l0aCBZPXVwLFxuICAgIC8vIGJ1dCB0aGUgTkRDIHNjYWxpbmcgaGFzIFk9ZG93biAodGhhbmtzIEQzRD8pXG4gICAgbVsxICogNCArIDBdID0gMC4wO1xuICAgIG1bMSAqIDQgKyAxXSA9IHNjYWxlQW5kT2Zmc2V0LnNjYWxlWzFdO1xuICAgIG1bMSAqIDQgKyAyXSA9IC1zY2FsZUFuZE9mZnNldC5vZmZzZXRbMV0gKiBoYW5kZWRuZXNzU2NhbGU7XG4gICAgbVsxICogNCArIDNdID0gMC4wO1xuXG4gICAgLy8gWiByZXN1bHQgKHVwIHRvIHRoZSBhcHApXG4gICAgbVsyICogNCArIDBdID0gMC4wO1xuICAgIG1bMiAqIDQgKyAxXSA9IDAuMDtcbiAgICBtWzIgKiA0ICsgMl0gPSB6RmFyIC8gKHpOZWFyIC0gekZhcikgKiAtaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMiAqIDQgKyAzXSA9ICh6RmFyICogek5lYXIpIC8gKHpOZWFyIC0gekZhcik7XG5cbiAgICAvLyBXIHJlc3VsdCAoPSBaIGluKVxuICAgIG1bMyAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzMgKiA0ICsgMV0gPSAwLjA7XG4gICAgbVszICogNCArIDJdID0gaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMyAqIDQgKyAzXSA9IDAuMDtcblxuICAgIG1vYmoudHJhbnNwb3NlKCk7XG5cbiAgICByZXR1cm4gbW9iajtcbn1cblxuZnVuY3Rpb24gZm92VG9Qcm9qZWN0aW9uKCBmb3YsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApIHtcbiAgICB2YXIgREVHMlJBRCA9IE1hdGguUEkgLyAxODAuMDtcblxuICAgIHZhciBmb3ZQb3J0ID0ge1xuICAgICAgICB1cFRhbjogTWF0aC50YW4oIGZvdi51cERlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIGRvd25UYW46IE1hdGgudGFuKCBmb3YuZG93bkRlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIGxlZnRUYW46IE1hdGgudGFuKCBmb3YubGVmdERlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIHJpZ2h0VGFuOiBNYXRoLnRhbiggZm92LnJpZ2h0RGVncmVlcyAqIERFRzJSQUQgKVxuICAgIH07XG5cbiAgICByZXR1cm4gZm92UG9ydFRvUHJvamVjdGlvbiggZm92UG9ydCwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICk7XG59XG5cbmZ1bmN0aW9uIGV4dGVuZChzdXBlckNsYXNzLCBzdWJDbGFzc01ldGhvZHMgPSB7fSlcbntcbiAgICBmb3IodmFyIG1ldGhvZCBpbiBzdXBlckNsYXNzKXtcbiAgICAgICAgaWYoc3VwZXJDbGFzcy5oYXNPd25Qcm9wZXJ0eShtZXRob2QpICYmICFzdWJDbGFzc01ldGhvZHMuaGFzT3duUHJvcGVydHkobWV0aG9kKSl7XG4gICAgICAgICAgICBzdWJDbGFzc01ldGhvZHNbbWV0aG9kXSA9IHN1cGVyQ2xhc3NbbWV0aG9kXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3ViQ2xhc3NNZXRob2RzO1xufVxuXG5mdW5jdGlvbiBkZWVwQ29weShvYmopIHtcbiAgICB2YXIgdG8gPSB7fTtcblxuICAgIGZvciAodmFyIG5hbWUgaW4gb2JqKVxuICAgIHtcbiAgICAgICAgdG9bbmFtZV0gPSBvYmpbbmFtZV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gICAgd2hpY2hUcmFuc2l0aW9uRXZlbnQ6IHdoaWNoVHJhbnNpdGlvbkV2ZW50LFxuICAgIG1vYmlsZUFuZFRhYmxldGNoZWNrOiBtb2JpbGVBbmRUYWJsZXRjaGVjayxcbiAgICBpc0lvczogaXNJb3MsXG4gICAgaXNSZWFsSXBob25lOiBpc1JlYWxJcGhvbmUsXG4gICAgZm92VG9Qcm9qZWN0aW9uOiBmb3ZUb1Byb2plY3Rpb24sXG4gICAgZXh0ZW5kOiBleHRlbmQsXG4gICAgZGVlcENvcHk6IGRlZXBDb3B5XG59OyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gOC8xMy8xNi5cbiAqL1xuXG52YXIgVlJCdXR0b24gPSBmdW5jdGlvbihCdXR0b25Db21wb25lbnQpe1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBCdXR0b25Db21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGJ1aWxkQ1NTQ2xhc3M6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGB2anMtVlItY29udHJvbCAke0J1dHRvbkNvbXBvbmVudC5wcm90b3R5cGUuYnVpbGRDU1NDbGFzcy5jYWxsKHRoaXMpfWA7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlQ2xpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBjYW52YXMgPSB0aGlzLnBsYXllcigpLmdldENoaWxkKFwiQ2FudmFzXCIpO1xuICAgICAgICAgICAgKCFjYW52YXMuVlJNb2RlKT8gY2FudmFzLmVuYWJsZVZSKCkgOiBjYW52YXMuZGlzYWJsZVZSKCk7XG4gICAgICAgICAgICAoY2FudmFzLlZSTW9kZSk/IHRoaXMuYWRkQ2xhc3MoXCJlbmFibGVcIikgOiB0aGlzLnJlbW92ZUNsYXNzKFwiZW5hYmxlXCIpO1xuICAgICAgICAgICAgKGNhbnZhcy5WUk1vZGUpPyAgdGhpcy5wbGF5ZXIoKS50cmlnZ2VyKCdWUk1vZGVPbicpOiAgdGhpcy5wbGF5ZXIoKS50cmlnZ2VyKCdWUk1vZGVPZmYnKTtcbiAgICAgICAgfSxcblxuICAgICAgICBjb250cm9sVGV4dF86IFwiVlJcIlxuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IFZSQnV0dG9uOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxuICovXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCB1dGlsIGZyb20gJy4vbGliL1V0aWwnO1xuaW1wb3J0IERldGVjdG9yIGZyb20gJy4vbGliL0RldGVjdG9yJztcbmltcG9ydCBtYWtlVmlkZW9QbGF5YWJsZUlubGluZSBmcm9tICdpcGhvbmUtaW5saW5lLXZpZGVvJztcblxuY29uc3QgcnVuT25Nb2JpbGUgPSAodXRpbC5tb2JpbGVBbmRUYWJsZXRjaGVjaygpKTtcblxuLy8gRGVmYXVsdCBvcHRpb25zIGZvciB0aGUgcGx1Z2luLlxuY29uc3QgZGVmYXVsdHMgPSB7XG4gICAgY2xpY2tBbmREcmFnOiBydW5Pbk1vYmlsZSxcbiAgICBzaG93Tm90aWNlOiB0cnVlLFxuICAgIE5vdGljZU1lc3NhZ2U6IFwiUGxlYXNlIHVzZSB5b3VyIG1vdXNlIGRyYWcgYW5kIGRyb3AgdGhlIHZpZGVvLlwiLFxuICAgIGF1dG9IaWRlTm90aWNlOiAzMDAwLFxuICAgIC8vbGltaXQgdGhlIHZpZGVvIHNpemUgd2hlbiB1c2VyIHNjcm9sbC5cbiAgICBzY3JvbGxhYmxlOiB0cnVlLFxuICAgIGluaXRGb3Y6IDc1LFxuICAgIG1heEZvdjogMTA1LFxuICAgIG1pbkZvdjogNTEsXG4gICAgLy9pbml0aWFsIHBvc2l0aW9uIGZvciB0aGUgdmlkZW9cbiAgICBpbml0TGF0OiAwLFxuICAgIGluaXRMb246IC0xODAsXG4gICAgLy9BIGZsb2F0IHZhbHVlIGJhY2sgdG8gY2VudGVyIHdoZW4gbW91c2Ugb3V0IHRoZSBjYW52YXMuIFRoZSBoaWdoZXIsIHRoZSBmYXN0ZXIuXG4gICAgcmV0dXJuU3RlcExhdDogMC41LFxuICAgIHJldHVyblN0ZXBMb246IDIsXG4gICAgYmFja1RvVmVydGljYWxDZW50ZXI6ICFydW5Pbk1vYmlsZSxcbiAgICBiYWNrVG9Ib3Jpem9uQ2VudGVyOiAhcnVuT25Nb2JpbGUsXG4gICAgY2xpY2tUb1RvZ2dsZTogZmFsc2UsXG5cbiAgICAvL2xpbWl0IHZpZXdhYmxlIHpvb21cbiAgICBtaW5MYXQ6IC04NSxcbiAgICBtYXhMYXQ6IDg1LFxuXG4gICAgbWluTG9uOiAtSW5maW5pdHksXG4gICAgbWF4TG9uOiBJbmZpbml0eSxcblxuICAgIHZpZGVvVHlwZTogXCJlcXVpcmVjdGFuZ3VsYXJcIixcblxuICAgIHJvdGF0ZVg6IDAsXG4gICAgcm90YXRlWTogMCxcbiAgICByb3RhdGVaOiAwLFxuXG4gICAgYXV0b01vYmlsZU9yaWVudGF0aW9uOiBmYWxzZSxcbiAgICBtb2JpbGVWaWJyYXRpb25WYWx1ZTogdXRpbC5pc0lvcygpPyAwLjAyMiA6IDEsXG5cbiAgICBWUkVuYWJsZTogdHJ1ZSxcbiAgICBWUkdhcERlZ3JlZTogMi41LFxuXG4gICAgY2xvc2VQYW5vcmFtYTogZmFsc2VcblxuXG59O1xuXG5mdW5jdGlvbiBwbGF5ZXJSZXNpemUocGxheWVyKXtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS53aWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoICsgXCJweFwiO1xuICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS5oZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBmdWxsc2NyZWVuT25JT1MocGxheWVyLCBjbGlja0ZuKSB7XG4gICAgdmFyIHJlc2l6ZUZuID0gcGxheWVyUmVzaXplKHBsYXllcik7XG4gICAgcGxheWVyLmNvbnRyb2xCYXIuZnVsbHNjcmVlblRvZ2dsZS5vZmYoXCJ0YXBcIiwgY2xpY2tGbik7XG4gICAgcGxheWVyLmNvbnRyb2xCYXIuZnVsbHNjcmVlblRvZ2dsZS5vbihcInRhcFwiLCBmdW5jdGlvbiBmdWxsc2NyZWVuKCkge1xuICAgICAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICAgICAgaWYoIXBsYXllci5pc0Z1bGxzY3JlZW4oKSl7XG4gICAgICAgICAgICAvL3NldCB0byBmdWxsc2NyZWVuXG4gICAgICAgICAgICBwbGF5ZXIuaXNGdWxsc2NyZWVuKHRydWUpO1xuICAgICAgICAgICAgcGxheWVyLmVudGVyRnVsbFdpbmRvdygpO1xuICAgICAgICAgICAgcmVzaXplRm4oKTtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZGV2aWNlbW90aW9uXCIsIHJlc2l6ZUZuKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBwbGF5ZXIuaXNGdWxsc2NyZWVuKGZhbHNlKTtcbiAgICAgICAgICAgIHBsYXllci5leGl0RnVsbFdpbmRvdygpO1xuICAgICAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUud2lkdGggPSBcIlwiO1xuICAgICAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUuaGVpZ2h0ID0gXCJcIjtcbiAgICAgICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwiZGV2aWNlbW90aW9uXCIsIHJlc2l6ZUZuKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG4vKipcbiAqIEZ1bmN0aW9uIHRvIGludm9rZSB3aGVuIHRoZSBwbGF5ZXIgaXMgcmVhZHkuXG4gKlxuICogVGhpcyBpcyBhIGdyZWF0IHBsYWNlIGZvciB5b3VyIHBsdWdpbiB0byBpbml0aWFsaXplIGl0c2VsZi4gV2hlbiB0aGlzXG4gKiBmdW5jdGlvbiBpcyBjYWxsZWQsIHRoZSBwbGF5ZXIgd2lsbCBoYXZlIGl0cyBET00gYW5kIGNoaWxkIGNvbXBvbmVudHNcbiAqIGluIHBsYWNlLlxuICpcbiAqIEBmdW5jdGlvbiBvblBsYXllclJlYWR5XG4gKiBAcGFyYW0gICAge1BsYXllcn0gcGxheWVyXG4gKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gKi9cbmNvbnN0IG9uUGxheWVyUmVhZHkgPSAocGxheWVyLCBvcHRpb25zLCBzZXR0aW5ncykgPT4ge1xuICAgIHBsYXllci5hZGRDbGFzcygndmpzLXBhbm9yYW1hJyk7XG4gICAgaWYoIURldGVjdG9yLndlYmdsKXtcbiAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCB7XG4gICAgICAgICAgICBOb3RpY2VNZXNzYWdlOiBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpLFxuICAgICAgICAgICAgYXV0b0hpZGVOb3RpY2U6IG9wdGlvbnMuYXV0b0hpZGVOb3RpY2VcbiAgICAgICAgfSk7XG4gICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spe1xuICAgICAgICAgICAgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcGxheWVyLmFkZENoaWxkKCdDYW52YXMnLCB1dGlsLmRlZXBDb3B5KG9wdGlvbnMpKTtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICBpZihydW5Pbk1vYmlsZSl7XG4gICAgICAgIHZhciB2aWRlb0VsZW1lbnQgPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgIGlmKHV0aWwuaXNSZWFsSXBob25lKCkpe1xuICAgICAgICAgICAgLy9pb3MgMTAgc3VwcG9ydCBwbGF5IHZpZGVvIGlubGluZVxuICAgICAgICAgICAgdmlkZW9FbGVtZW50LnNldEF0dHJpYnV0ZShcInBsYXlzaW5saW5lXCIsIFwiXCIpO1xuICAgICAgICAgICAgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUodmlkZW9FbGVtZW50LCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBpZih1dGlsLmlzSW9zKCkpe1xuICAgICAgICAgICAgZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgc2V0dGluZ3MuZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSk7XG4gICAgICAgIH1cbiAgICAgICAgcGxheWVyLmFkZENsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW9cIik7XG4gICAgICAgIHBsYXllci5yZW1vdmVDbGFzcyhcInZqcy11c2luZy1uYXRpdmUtY29udHJvbHNcIik7XG4gICAgICAgIGNhbnZhcy5wbGF5T25Nb2JpbGUoKTtcbiAgICB9XG4gICAgaWYob3B0aW9ucy5zaG93Tm90aWNlKXtcbiAgICAgICAgcGxheWVyLm9uKFwicGxheWluZ1wiLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCB1dGlsLmRlZXBDb3B5KG9wdGlvbnMpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGlmKG9wdGlvbnMuVlJFbmFibGUgJiYgb3B0aW9ucy52aWRlb1R5cGUgIT09IFwiM2RWaWRlb1wiKXtcbiAgICAgICAgcGxheWVyLmNvbnRyb2xCYXIuYWRkQ2hpbGQoJ1ZSQnV0dG9uJywge30sIHBsYXllci5jb250cm9sQmFyLmNoaWxkcmVuKCkubGVuZ3RoIC0gMSk7XG4gICAgfVxuICAgIGNhbnZhcy5oaWRlKCk7XG4gICAgcGxheWVyLm9uKFwicGxheVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5zaG93KCk7XG4gICAgfSk7XG4gICAgcGxheWVyLm9uKFwiZnVsbHNjcmVlbmNoYW5nZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICB9KTtcbiAgICBpZihvcHRpb25zLmNhbGxiYWNrKSBvcHRpb25zLmNhbGxiYWNrKCk7XG59O1xuXG5jb25zdCBQb3B1cE5vdGlmaWNhdGlvbiA9IChwbGF5ZXIsIG9wdGlvbnMgPSB7XG4gICAgTm90aWNlTWVzc2FnZTogXCJcIlxufSkgPT4ge1xuICAgIHZhciBub3RpY2UgPSBwbGF5ZXIuYWRkQ2hpbGQoJ05vdGljZScsIG9wdGlvbnMpO1xuXG4gICAgaWYob3B0aW9ucy5hdXRvSGlkZU5vdGljZSA+IDApe1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIG5vdGljZS5hZGRDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgIHZhciB0cmFuc2l0aW9uRXZlbnQgPSB1dGlsLndoaWNoVHJhbnNpdGlvbkV2ZW50KCk7XG4gICAgICAgICAgICB2YXIgaGlkZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5yZW1vdmVDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgICAgICBub3RpY2Uub2ZmKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgbm90aWNlLm9uKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgIH0sIG9wdGlvbnMuYXV0b0hpZGVOb3RpY2UpO1xuICAgIH1cbn07XG5cbmNvbnN0IHBsdWdpbiA9IGZ1bmN0aW9uKHNldHRpbmdzID0ge30pe1xuICAgIC8qKlxuICAgICAqIEEgdmlkZW8uanMgcGx1Z2luLlxuICAgICAqXG4gICAgICogSW4gdGhlIHBsdWdpbiBmdW5jdGlvbiwgdGhlIHZhbHVlIG9mIGB0aGlzYCBpcyBhIHZpZGVvLmpzIGBQbGF5ZXJgXG4gICAgICogaW5zdGFuY2UuIFlvdSBjYW5ub3QgcmVseSBvbiB0aGUgcGxheWVyIGJlaW5nIGluIGEgXCJyZWFkeVwiIHN0YXRlIGhlcmUsXG4gICAgICogZGVwZW5kaW5nIG9uIGhvdyB0aGUgcGx1Z2luIGlzIGludm9rZWQuIFRoaXMgbWF5IG9yIG1heSBub3QgYmUgaW1wb3J0YW50XG4gICAgICogdG8geW91OyBpZiBub3QsIHJlbW92ZSB0aGUgd2FpdCBmb3IgXCJyZWFkeVwiIVxuICAgICAqXG4gICAgICogQGZ1bmN0aW9uIHBhbm9yYW1hXG4gICAgICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICAgICAqICAgICAgICAgICBBbiBvYmplY3Qgb2Ygb3B0aW9ucyBsZWZ0IHRvIHRoZSBwbHVnaW4gYXV0aG9yIHRvIGRlZmluZS5cbiAgICAgKi9cbiAgICBjb25zdCB2aWRlb1R5cGVzID0gW1wiZXF1aXJlY3Rhbmd1bGFyXCIsIFwiZmlzaGV5ZVwiLCBcIjNkVmlkZW9cIl07XG4gICAgY29uc3QgcGFub3JhbWEgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIGlmKHNldHRpbmdzLm1lcmdlT3B0aW9uKSBvcHRpb25zID0gc2V0dGluZ3MubWVyZ2VPcHRpb24oZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgICAgICBpZih0eXBlb2Ygc2V0dGluZ3MuX2luaXQgPT09IFwidW5kZWZpbmVkXCIgfHwgdHlwZW9mIHNldHRpbmdzLl9pbml0ICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJwbHVnaW4gbXVzdCBpbXBsZW1lbnQgaW5pdCBmdW5jdGlvbigpLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZih2aWRlb1R5cGVzLmluZGV4T2Yob3B0aW9ucy52aWRlb1R5cGUpID09IC0xKSBvcHRpb25zLnZpZGVvVHlwZSA9IGRlZmF1bHRzLnZpZGVvVHlwZTtcbiAgICAgICAgc2V0dGluZ3MuX2luaXQob3B0aW9ucyk7XG4gICAgICAgIC8qIGltcGxlbWVudCBjYWxsYmFjayBmdW5jdGlvbiB3aGVuIHZpZGVvanMgaXMgcmVhZHkgKi9cbiAgICAgICAgdGhpcy5yZWFkeSgoKSA9PiB7XG4gICAgICAgICAgICBvblBsYXllclJlYWR5KHRoaXMsIG9wdGlvbnMsIHNldHRpbmdzKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuLy8gSW5jbHVkZSB0aGUgdmVyc2lvbiBudW1iZXIuXG4gICAgcGFub3JhbWEuVkVSU0lPTiA9ICcwLjEuMyc7XG5cbiAgICByZXR1cm4gcGFub3JhbWE7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBwbHVnaW47XG4iLCIndXNlIHN0cmljdCc7XG5cbmltcG9ydCBDYW52YXMgIGZyb20gJy4vbGliL0NhbnZhcyc7XG5pbXBvcnQgVGhyZWVEQ2FudmFzIGZyb20gJy4vbGliL1RocmVlQ2FudmFzJztcbmltcG9ydCBOb3RpY2UgIGZyb20gJy4vbGliL05vdGljZSc7XG5pbXBvcnQgSGVscGVyQ2FudmFzIGZyb20gJy4vbGliL0hlbHBlckNhbnZhcyc7XG5pbXBvcnQgVlJCdXR0b24gZnJvbSAnLi9saWIvVlJCdXR0b24nO1xuaW1wb3J0IHBhbm9yYW1hIGZyb20gJy4vcGx1Z2luJztcblxuZnVuY3Rpb24gZ2V0VGVjaChwbGF5ZXIpIHtcbiAgICByZXR1cm4gcGxheWVyLnRlY2g/IHBsYXllci50ZWNoLmVsKCk6XG4gICAgICAgIHBsYXllci5oLmVsKCk7XG59XG5cbmZ1bmN0aW9uIGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuKHBsYXllcikge1xuICAgIHJldHVybiBwbGF5ZXIuY29udHJvbEJhci5mdWxsc2NyZWVuVG9nZ2xlLm9uQ2xpY2sgfHwgcGxheWVyLmNvbnRyb2xCYXIuZnVsbHNjcmVlblRvZ2dsZS51O1xufVxuXG52YXIgY29tcG9uZW50ID0gdmlkZW9qcy5Db21wb25lbnQ7XG52YXIgY29tcGF0aWFibGVJbml0aWFsRnVuY3Rpb24gPSBmdW5jdGlvbiAocGxheWVyLCBvcHRpb25zKSB7XG4gICAgdGhpcy5jb25zdHJ1Y3RvcihwbGF5ZXIsIG9wdGlvbnMpO1xufTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xubm90aWNlLmluaXQgPSBjb21wYXRpYWJsZUluaXRpYWxGdW5jdGlvbjtcbnZpZGVvanMuTm90aWNlID0gY29tcG9uZW50LmV4dGVuZChub3RpY2UpO1xuXG52YXIgaGVscGVyQ2FudmFzID0gSGVscGVyQ2FudmFzKGNvbXBvbmVudCk7XG5oZWxwZXJDYW52YXMuaW5pdCA9IGNvbXBhdGlhYmxlSW5pdGlhbEZ1bmN0aW9uO1xudmlkZW9qcy5IZWxwZXJDYW52YXMgPSBjb21wb25lbnQuZXh0ZW5kKGhlbHBlckNhbnZhcyk7XG5cbnZhciBidXR0b24gPSB2aWRlb2pzLkJ1dHRvbjtcbnZhciB2ckJ0biA9IFZSQnV0dG9uKGJ1dHRvbik7XG52ckJ0bi5pbml0ID0gY29tcGF0aWFibGVJbml0aWFsRnVuY3Rpb247XG52ckJ0bi5vbkNsaWNrID0gdnJCdG4udSA9IHZyQnRuLmhhbmRsZUNsaWNrO1xudnJCdG4uYnV0dG9uVGV4dCA9IHZyQnRuLnRhID0gdnJCdG4uY29udHJvbFRleHRfO1xudnJCdG4uVCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gYHZqcy1WUi1jb250cm9sICR7YnV0dG9uLnByb3RvdHlwZS5ULmNhbGwodGhpcyl9YDtcbn07XG52aWRlb2pzLlZSQnV0dG9uID0gYnV0dG9uLmV4dGVuZCh2ckJ0bik7XG5cbi8vIFJlZ2lzdGVyIHRoZSBwbHVnaW4gd2l0aCB2aWRlby5qcy5cbnZpZGVvanMucGx1Z2luKCdwYW5vcmFtYScsIHBhbm9yYW1hKHtcbiAgICBfaW5pdDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNhbnZhcyA9IChvcHRpb25zLnZpZGVvVHlwZSAhPT0gXCIzZFZpZGVvXCIpP1xuICAgICAgICAgICAgQ2FudmFzKGNvbXBvbmVudCwgd2luZG93LlRIUkVFLCB7XG4gICAgICAgICAgICAgICAgZ2V0VGVjaDogZ2V0VGVjaFxuICAgICAgICAgICAgfSkgOlxuICAgICAgICAgICAgVGhyZWVEQ2FudmFzKGNvbXBvbmVudCwgd2luZG93LlRIUkVFLCB7XG4gICAgICAgICAgICAgICAgZ2V0VGVjaDogZ2V0VGVjaFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIGNhbnZhcy5pbml0ID0gY29tcGF0aWFibGVJbml0aWFsRnVuY3Rpb247XG4gICAgICAgIHZpZGVvanMuQ2FudmFzID0gY29tcG9uZW50LmV4dGVuZChjYW52YXMpO1xuICAgIH0sXG4gICAgbWVyZ2VPcHRpb246IGZ1bmN0aW9uIChkZWZhdWx0cywgb3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdmlkZW9qcy51dGlsLm1lcmdlT3B0aW9ucyhkZWZhdWx0cywgb3B0aW9ucyk7XG4gICAgfSxcbiAgICBnZXRUZWNoOiBnZXRUZWNoLFxuICAgIGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuOiBnZXRGdWxsc2NyZWVuVG9nZ2xlQ2xpY2tGblxufSkpOyJdfQ==
