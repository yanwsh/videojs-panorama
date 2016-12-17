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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaW50ZXJ2YWxvbWV0ZXIvZGlzdC9pbnRlcnZhbG9tZXRlci5jb21tb24tanMuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwibm9kZV9tb2R1bGVzL3Bvb3ItbWFucy1zeW1ib2wvZGlzdC9wb29yLW1hbnMtc3ltYm9sLmNvbW1vbi1qcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9CYXNlQ2FudmFzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9UaHJlZUNhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvbGliL1ZSQnV0dG9uLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y1LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2VUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7Ozs7Ozs7O0FBUUE7Ozs7OztBQUVBOzs7O0FBQ0E7Ozs7OztBQUVBLElBQU0sb0JBQW9CLENBQTFCOztBQUVBLElBQUksYUFBYSxTQUFiLFVBQWEsQ0FBVSxhQUFWLEVBQXlCLEtBQXpCLEVBQStDO0FBQUEsUUFBZixRQUFlLHVFQUFKLEVBQUk7O0FBQzVELFdBQU87QUFDSCxxQkFBYSxTQUFTLElBQVQsQ0FBYyxNQUFk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LGlCQUFSLENBQTBCLFFBQTFCLEVBQW9DLFFBQVEsTUFBUixDQUFlLFNBQWYsRUFBMEIsTUFBMUIsQ0FBcEM7O0FBRUEsSUFBSSxlQUFlLDRCQUFhLFNBQWIsQ0FBbkI7QUFDQSxRQUFRLGlCQUFSLENBQTBCLGNBQTFCLEVBQTBDLFFBQVEsTUFBUixDQUFlLFNBQWYsRUFBMEIsWUFBMUIsQ0FBMUM7O0FBRUEsSUFBSSxTQUFTLFFBQVEsWUFBUixDQUFxQixRQUFyQixDQUFiO0FBQ0EsSUFBSSxRQUFRLHdCQUFTLE1BQVQsQ0FBWjtBQUNBLFFBQVEsaUJBQVIsQ0FBMEIsVUFBMUIsRUFBc0MsUUFBUSxNQUFSLENBQWUsTUFBZixFQUF1QixLQUF2QixDQUF0Qzs7QUFFQTtBQUNBLFFBQVEsTUFBUixDQUFlLFVBQWYsRUFBMkIsc0JBQVM7QUFDaEMsV0FBTyxlQUFTLE9BQVQsRUFBaUI7QUFDcEIsWUFBSSxTQUFVLFFBQVEsU0FBUixLQUFzQixTQUF2QixHQUNULHNCQUFPLFNBQVAsRUFBa0IsT0FBTyxLQUF6QixFQUFnQztBQUM1QixxQkFBUztBQURtQixTQUFoQyxDQURTLEdBSVQsMkJBQWEsU0FBYixFQUF3QixPQUFPLEtBQS9CLEVBQXNDO0FBQ2xDLHFCQUFTO0FBRHlCLFNBQXRDLENBSko7QUFPQSxnQkFBUSxpQkFBUixDQUEwQixRQUExQixFQUFvQyxRQUFRLE1BQVIsQ0FBZSxTQUFmLEVBQTBCLE1BQTFCLENBQXBDO0FBQ0gsS0FWK0I7QUFXaEMsaUJBQWEscUJBQVUsUUFBVixFQUFvQixPQUFwQixFQUE2QjtBQUN0QyxlQUFPLFFBQVEsWUFBUixDQUFxQixRQUFyQixFQUErQixPQUEvQixDQUFQO0FBQ0gsS0FiK0I7QUFjaEMsYUFBUyxPQWR1QjtBQWVoQyxnQ0FBNEI7QUFmSSxDQUFULENBQTNCIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qISBucG0uaW0vaW50ZXJ2YWxvbWV0ZXIgKi9cbid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsICdfX2VzTW9kdWxlJywgeyB2YWx1ZTogdHJ1ZSB9KTtcblxuZnVuY3Rpb24gaW50ZXJ2YWxvbWV0ZXIoY2IsIHJlcXVlc3QsIGNhbmNlbCwgcmVxdWVzdFBhcmFtZXRlcikge1xuXHR2YXIgcmVxdWVzdElkO1xuXHR2YXIgcHJldmlvdXNMb29wVGltZTtcblx0ZnVuY3Rpb24gbG9vcChub3cpIHtcblx0XHQvLyBtdXN0IGJlIHJlcXVlc3RlZCBiZWZvcmUgY2IoKSBiZWNhdXNlIHRoYXQgbWlnaHQgY2FsbCAuc3RvcCgpXG5cdFx0cmVxdWVzdElkID0gcmVxdWVzdChsb29wLCByZXF1ZXN0UGFyYW1ldGVyKTtcblxuXHRcdC8vIGNhbGxlZCB3aXRoIFwibXMgc2luY2UgbGFzdCBjYWxsXCIuIDAgb24gc3RhcnQoKVxuXHRcdGNiKG5vdyAtIChwcmV2aW91c0xvb3BUaW1lIHx8IG5vdykpO1xuXG5cdFx0cHJldmlvdXNMb29wVGltZSA9IG5vdztcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0OiBmdW5jdGlvbiBzdGFydCgpIHtcblx0XHRcdGlmICghcmVxdWVzdElkKSB7IC8vIHByZXZlbnQgZG91YmxlIHN0YXJ0c1xuXHRcdFx0XHRsb29wKDApO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0c3RvcDogZnVuY3Rpb24gc3RvcCgpIHtcblx0XHRcdGNhbmNlbChyZXF1ZXN0SWQpO1xuXHRcdFx0cmVxdWVzdElkID0gbnVsbDtcblx0XHRcdHByZXZpb3VzTG9vcFRpbWUgPSAwO1xuXHRcdH1cblx0fTtcbn1cblxuZnVuY3Rpb24gZnJhbWVJbnRlcnZhbG9tZXRlcihjYikge1xuXHRyZXR1cm4gaW50ZXJ2YWxvbWV0ZXIoY2IsIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUpO1xufVxuXG5mdW5jdGlvbiB0aW1lckludGVydmFsb21ldGVyKGNiLCBkZWxheSkge1xuXHRyZXR1cm4gaW50ZXJ2YWxvbWV0ZXIoY2IsIHNldFRpbWVvdXQsIGNsZWFyVGltZW91dCwgZGVsYXkpO1xufVxuXG5leHBvcnRzLmludGVydmFsb21ldGVyID0gaW50ZXJ2YWxvbWV0ZXI7XG5leHBvcnRzLmZyYW1lSW50ZXJ2YWxvbWV0ZXIgPSBmcmFtZUludGVydmFsb21ldGVyO1xuZXhwb3J0cy50aW1lckludGVydmFsb21ldGVyID0gdGltZXJJbnRlcnZhbG9tZXRlcjsiLCIvKiEgbnBtLmltL2lwaG9uZS1pbmxpbmUtdmlkZW8gKi9cbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gX2ludGVyb3BEZWZhdWx0IChleCkgeyByZXR1cm4gKGV4ICYmICh0eXBlb2YgZXggPT09ICdvYmplY3QnKSAmJiAnZGVmYXVsdCcgaW4gZXgpID8gZXhbJ2RlZmF1bHQnXSA6IGV4OyB9XG5cbnZhciBTeW1ib2wgPSBfaW50ZXJvcERlZmF1bHQocmVxdWlyZSgncG9vci1tYW5zLXN5bWJvbCcpKTtcbnZhciBpbnRlcnZhbG9tZXRlciA9IHJlcXVpcmUoJ2ludGVydmFsb21ldGVyJyk7XG5cbmZ1bmN0aW9uIHByZXZlbnRFdmVudChlbGVtZW50LCBldmVudE5hbWUsIHRvZ2dsZVByb3BlcnR5LCBwcmV2ZW50V2l0aFByb3BlcnR5KSB7XG5cdGZ1bmN0aW9uIGhhbmRsZXIoZSkge1xuXHRcdGlmIChCb29sZWFuKGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldKSA9PT0gQm9vbGVhbihwcmV2ZW50V2l0aFByb3BlcnR5KSkge1xuXHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdC8vIGNvbnNvbGUubG9nKGV2ZW50TmFtZSwgJ3ByZXZlbnRlZCBvbicsIGVsZW1lbnQpO1xuXHRcdH1cblx0XHRkZWxldGUgZWxlbWVudFt0b2dnbGVQcm9wZXJ0eV07XG5cdH1cblx0ZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgaGFuZGxlciwgZmFsc2UpO1xuXG5cdC8vIFJldHVybiBoYW5kbGVyIHRvIGFsbG93IHRvIGRpc2FibGUgdGhlIHByZXZlbnRpb24uIFVzYWdlOlxuXHQvLyBjb25zdCBwcmV2ZW50aW9uSGFuZGxlciA9IHByZXZlbnRFdmVudChlbCwgJ2NsaWNrJyk7XG5cdC8vIGVsLnJlbW92ZUV2ZW50SGFuZGxlcignY2xpY2snLCBwcmV2ZW50aW9uSGFuZGxlcik7XG5cdHJldHVybiBoYW5kbGVyO1xufVxuXG5mdW5jdGlvbiBwcm94eVByb3BlcnR5KG9iamVjdCwgcHJvcGVydHlOYW1lLCBzb3VyY2VPYmplY3QsIGNvcHlGaXJzdCkge1xuXHRmdW5jdGlvbiBnZXQoKSB7XG5cdFx0cmV0dXJuIHNvdXJjZU9iamVjdFtwcm9wZXJ0eU5hbWVdO1xuXHR9XG5cdGZ1bmN0aW9uIHNldCh2YWx1ZSkge1xuXHRcdHNvdXJjZU9iamVjdFtwcm9wZXJ0eU5hbWVdID0gdmFsdWU7XG5cdH1cblxuXHRpZiAoY29weUZpcnN0KSB7XG5cdFx0c2V0KG9iamVjdFtwcm9wZXJ0eU5hbWVdKTtcblx0fVxuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwge2dldDogZ2V0LCBzZXQ6IHNldH0pO1xufVxuXG5mdW5jdGlvbiBwcm94eUV2ZW50KG9iamVjdCwgZXZlbnROYW1lLCBzb3VyY2VPYmplY3QpIHtcblx0c291cmNlT2JqZWN0LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBmdW5jdGlvbiAoKSB7IHJldHVybiBvYmplY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoZXZlbnROYW1lKSk7IH0pO1xufVxuXG5mdW5jdGlvbiBkaXNwYXRjaEV2ZW50QXN5bmMoZWxlbWVudCwgdHlwZSkge1xuXHRQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KHR5cGUpKTtcblx0fSk7XG59XG5cbi8vIGlPUyAxMCBhZGRzIHN1cHBvcnQgZm9yIG5hdGl2ZSBpbmxpbmUgcGxheWJhY2sgKyBzaWxlbnQgYXV0b3BsYXlcbnZhciBpc1doaXRlbGlzdGVkID0gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSAmJiAhbWF0Y2hNZWRpYSgnKC13ZWJraXQtdmlkZW8tcGxheWFibGUtaW5saW5lKScpLm1hdGNoZXM7XG5cbnZhciDgsqAgPSBTeW1ib2woKTtcbnZhciDgsqBldmVudCA9IFN5bWJvbCgpO1xudmFyIOCyoHBsYXkgPSBTeW1ib2woJ25hdGl2ZXBsYXknKTtcbnZhciDgsqBwYXVzZSA9IFN5bWJvbCgnbmF0aXZlcGF1c2UnKTtcblxuLyoqXG4gKiBVVElMU1xuICovXG5cbmZ1bmN0aW9uIGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKSB7XG5cdHZhciBhdWRpbyA9IG5ldyBBdWRpbygpO1xuXHRwcm94eUV2ZW50KHZpZGVvLCAncGxheScsIGF1ZGlvKTtcblx0cHJveHlFdmVudCh2aWRlbywgJ3BsYXlpbmcnLCBhdWRpbyk7XG5cdHByb3h5RXZlbnQodmlkZW8sICdwYXVzZScsIGF1ZGlvKTtcblx0YXVkaW8uY3Jvc3NPcmlnaW4gPSB2aWRlby5jcm9zc09yaWdpbjtcblxuXHQvLyAnZGF0YTonIGNhdXNlcyBhdWRpby5uZXR3b3JrU3RhdGUgPiAwXG5cdC8vIHdoaWNoIHRoZW4gYWxsb3dzIHRvIGtlZXAgPGF1ZGlvPiBpbiBhIHJlc3VtYWJsZSBwbGF5aW5nIHN0YXRlXG5cdC8vIGkuZS4gb25jZSB5b3Ugc2V0IGEgcmVhbCBzcmMgaXQgd2lsbCBrZWVwIHBsYXlpbmcgaWYgaXQgd2FzIGlmIC5wbGF5KCkgd2FzIGNhbGxlZFxuXHRhdWRpby5zcmMgPSB2aWRlby5zcmMgfHwgdmlkZW8uY3VycmVudFNyYyB8fCAnZGF0YTonO1xuXG5cdC8vIGlmIChhdWRpby5zcmMgPT09ICdkYXRhOicpIHtcblx0Ly8gICBUT0RPOiB3YWl0IGZvciB2aWRlbyB0byBiZSBzZWxlY3RlZFxuXHQvLyB9XG5cdHJldHVybiBhdWRpbztcbn1cblxudmFyIGxhc3RSZXF1ZXN0cyA9IFtdO1xudmFyIHJlcXVlc3RJbmRleCA9IDA7XG52YXIgbGFzdFRpbWV1cGRhdGVFdmVudDtcblxuZnVuY3Rpb24gc2V0VGltZSh2aWRlbywgdGltZSwgcmVtZW1iZXJPbmx5KSB7XG5cdC8vIGFsbG93IG9uZSB0aW1ldXBkYXRlIGV2ZW50IGV2ZXJ5IDIwMCsgbXNcblx0aWYgKChsYXN0VGltZXVwZGF0ZUV2ZW50IHx8IDApICsgMjAwIDwgRGF0ZS5ub3coKSkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0bGFzdFRpbWV1cGRhdGVFdmVudCA9IERhdGUubm93KCk7XG5cdH1cblx0aWYgKCFyZW1lbWJlck9ubHkpIHtcblx0XHR2aWRlby5jdXJyZW50VGltZSA9IHRpbWU7XG5cdH1cblx0bGFzdFJlcXVlc3RzWysrcmVxdWVzdEluZGV4ICUgM10gPSB0aW1lICogMTAwIHwgMCAvIDEwMDtcbn1cblxuZnVuY3Rpb24gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpIHtcblx0cmV0dXJuIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPj0gcGxheWVyLnZpZGVvLmR1cmF0aW9uO1xufVxuXG5mdW5jdGlvbiB1cGRhdGUodGltZURpZmYpIHtcblx0dmFyIHBsYXllciA9IHRoaXM7XG5cdC8vIGNvbnNvbGUubG9nKCd1cGRhdGUnLCBwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSwgcGxheWVyLnZpZGVvLm5ldHdvcmtTdGF0ZSwgcGxheWVyLmRyaXZlci5yZWFkeVN0YXRlLCBwbGF5ZXIuZHJpdmVyLm5ldHdvcmtTdGF0ZSwgcGxheWVyLmRyaXZlci5wYXVzZWQpO1xuXHRpZiAocGxheWVyLnZpZGVvLnJlYWR5U3RhdGUgPj0gcGxheWVyLnZpZGVvLkhBVkVfRlVUVVJFX0RBVEEpIHtcblx0XHRpZiAoIXBsYXllci5oYXNBdWRpbykge1xuXHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHBsYXllci52aWRlby5jdXJyZW50VGltZSArICgodGltZURpZmYgKiBwbGF5ZXIudmlkZW8ucGxheWJhY2tSYXRlKSAvIDEwMDApO1xuXHRcdFx0aWYgKHBsYXllci52aWRlby5sb29wICYmIGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0c2V0VGltZShwbGF5ZXIudmlkZW8sIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUpO1xuXHR9IGVsc2UgaWYgKHBsYXllci52aWRlby5uZXR3b3JrU3RhdGUgPT09IHBsYXllci52aWRlby5ORVRXT1JLX0lETEUgJiYgIXBsYXllci52aWRlby5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHQvLyB0aGlzIHNob3VsZCBoYXBwZW4gd2hlbiB0aGUgc291cmNlIGlzIGF2YWlsYWJsZSBidXQ6XG5cdFx0Ly8gLSBpdCdzIHBvdGVudGlhbGx5IHBsYXlpbmcgKC5wYXVzZWQgPT09IGZhbHNlKVxuXHRcdC8vIC0gaXQncyBub3QgcmVhZHkgdG8gcGxheVxuXHRcdC8vIC0gaXQncyBub3QgbG9hZGluZ1xuXHRcdC8vIElmIGl0IGhhc0F1ZGlvLCB0aGF0IHdpbGwgYmUgbG9hZGVkIGluIHRoZSAnZW1wdGllZCcgaGFuZGxlciBiZWxvd1xuXHRcdHBsYXllci52aWRlby5sb2FkKCk7XG5cdFx0Ly8gY29uc29sZS5sb2coJ1dpbGwgbG9hZCcpO1xuXHR9XG5cblx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lID09PSBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lLCAnVmlkZW8gbm90IHVwZGF0aW5nIScpO1xuXG5cdGlmIChwbGF5ZXIudmlkZW8uZW5kZWQpIHtcblx0XHRkZWxldGUgcGxheWVyLnZpZGVvW+CyoGV2ZW50XTsgLy8gYWxsb3cgdGltZXVwZGF0ZSBldmVudFxuXHRcdHBsYXllci52aWRlby5wYXVzZSh0cnVlKTtcblx0fVxufVxuXG4vKipcbiAqIE1FVEhPRFNcbiAqL1xuXG5mdW5jdGlvbiBwbGF5KCkge1xuXHQvLyBjb25zb2xlLmxvZygncGxheScpO1xuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHVzZSB0aGUgbmF0aXZlIHBsYXllclxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmIChwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gJ2RhdGE6JyAmJiBwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gdmlkZW8uc3JjKSB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkIG9uIHBsYXknLCB2aWRlby5zcmMpO1xuXHRcdHNldFRpbWUodmlkZW8sIDAsIHRydWUpO1xuXHRcdHBsYXllci5kcml2ZXIuc3JjID0gdmlkZW8uc3JjO1xuXHR9XG5cblx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cGxheWVyLnBhdXNlZCA9IGZhbHNlO1xuXG5cdGlmICghdmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0Ly8gLmxvYWQoKSBjYXVzZXMgdGhlIGVtcHRpZWQgZXZlbnRcblx0XHQvLyB0aGUgYWx0ZXJuYXRpdmUgaXMgLnBsYXkoKSsucGF1c2UoKSBidXQgdGhhdCB0cmlnZ2VycyBwbGF5L3BhdXNlIGV2ZW50cywgZXZlbiB3b3JzZVxuXHRcdC8vIHBvc3NpYmx5IHRoZSBhbHRlcm5hdGl2ZSBpcyBwcmV2ZW50aW5nIHRoaXMgZXZlbnQgb25seSBvbmNlXG5cdFx0dmlkZW8ubG9hZCgpO1xuXHR9XG5cblx0cGxheWVyLmRyaXZlci5wbGF5KCk7XG5cdHBsYXllci51cGRhdGVyLnN0YXJ0KCk7XG5cblx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5Jyk7XG5cdFx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0VOT1VHSF9EQVRBKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnb25wbGF5Jyk7XG5cdFx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5aW5nJyk7XG5cdFx0fVxuXHR9XG59XG5mdW5jdGlvbiBwYXVzZShmb3JjZUV2ZW50cykge1xuXHQvLyBjb25zb2xlLmxvZygncGF1c2UnKTtcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0cGxheWVyLmRyaXZlci5wYXVzZSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdG9wKCk7XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB0aGUgZGV2ZWxvcGVyIHRoZSBuYXRpdmUgcGxheWVyLnBhdXNlKClcblx0Ly8gVGhpcyBpcyBhdCB0aGUgZW5kIG9mIHBhdXNlKCkgYmVjYXVzZSBpdCBhbHNvXG5cdC8vIG5lZWRzIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBzaW11bGF0aW9uIGlzIHBhdXNlZFxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwYXVzZV0oKTtcblx0fVxuXG5cdGlmIChwbGF5ZXIucGF1c2VkICYmICFmb3JjZUV2ZW50cykge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHBsYXllci5wYXVzZWQgPSB0cnVlO1xuXHRpZiAoIXBsYXllci5oYXNBdWRpbykge1xuXHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ3BhdXNlJyk7XG5cdH1cblx0aWYgKHZpZGVvLmVuZGVkKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdlbmRlZCcpO1xuXHR9XG59XG5cbi8qKlxuICogU0VUVVBcbiAqL1xuXG5mdW5jdGlvbiBhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdID0ge307XG5cdHBsYXllci5wYXVzZWQgPSB0cnVlOyAvLyB0cmFjayB3aGV0aGVyICdwYXVzZScgZXZlbnRzIGhhdmUgYmVlbiBmaXJlZFxuXHRwbGF5ZXIuaGFzQXVkaW8gPSBoYXNBdWRpbztcblx0cGxheWVyLnZpZGVvID0gdmlkZW87XG5cdHBsYXllci51cGRhdGVyID0gaW50ZXJ2YWxvbWV0ZXIuZnJhbWVJbnRlcnZhbG9tZXRlcih1cGRhdGUuYmluZChwbGF5ZXIpKTtcblxuXHRpZiAoaGFzQXVkaW8pIHtcblx0XHRwbGF5ZXIuZHJpdmVyID0gZ2V0QXVkaW9Gcm9tVmlkZW8odmlkZW8pO1xuXHR9IGVsc2Uge1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2NhbnBsYXknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnb25jYW5wbGF5Jyk7XG5cdFx0XHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ3BsYXlpbmcnKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRwbGF5ZXIuZHJpdmVyID0ge1xuXHRcdFx0c3JjOiB2aWRlby5zcmMgfHwgdmlkZW8uY3VycmVudFNyYyB8fCAnZGF0YTonLFxuXHRcdFx0bXV0ZWQ6IHRydWUsXG5cdFx0XHRwYXVzZWQ6IHRydWUsXG5cdFx0XHRwYXVzZTogZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBhdXNlZCA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0cGxheTogZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBhdXNlZCA9IGZhbHNlO1xuXHRcdFx0XHQvLyBtZWRpYSBhdXRvbWF0aWNhbGx5IGdvZXMgdG8gMCBpZiAucGxheSgpIGlzIGNhbGxlZCB3aGVuIGl0J3MgZG9uZVxuXHRcdFx0XHRpZiAoaXNQbGF5ZXJFbmRlZChwbGF5ZXIpKSB7XG5cdFx0XHRcdFx0c2V0VGltZSh2aWRlbywgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXQgZW5kZWQoKSB7XG5cdFx0XHRcdHJldHVybiBpc1BsYXllckVuZGVkKHBsYXllcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vIC5sb2FkKCkgY2F1c2VzIHRoZSBlbXB0aWVkIGV2ZW50XG5cdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2VtcHRpZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ2RyaXZlciBzcmMgaXMnLCBwbGF5ZXIuZHJpdmVyLnNyYyk7XG5cdFx0dmFyIHdhc0VtcHR5ID0gIXBsYXllci5kcml2ZXIuc3JjIHx8IHBsYXllci5kcml2ZXIuc3JjID09PSAnZGF0YTonO1xuXHRcdGlmIChwbGF5ZXIuZHJpdmVyLnNyYyAmJiBwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gdmlkZW8uc3JjKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnc3JjIGNoYW5nZWQgdG8nLCB2aWRlby5zcmMpO1xuXHRcdFx0c2V0VGltZSh2aWRlbywgMCwgdHJ1ZSk7XG5cdFx0XHRwbGF5ZXIuZHJpdmVyLnNyYyA9IHZpZGVvLnNyYztcblx0XHRcdC8vIHBsYXlpbmcgdmlkZW9zIHdpbGwgb25seSBrZWVwIHBsYXlpbmcgaWYgbm8gc3JjIHdhcyBwcmVzZW50IHdoZW4gLnBsYXkoKeKAmWVkXG5cdFx0XHRpZiAod2FzRW1wdHkpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wbGF5KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwbGF5ZXIudXBkYXRlci5zdG9wKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LCBmYWxzZSk7XG5cblx0Ly8gc3RvcCBwcm9ncmFtbWF0aWMgcGxheWVyIHdoZW4gT1MgdGFrZXMgb3ZlclxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRiZWdpbmZ1bGxzY3JlZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRcdC8vIG1ha2Ugc3VyZSB0aGF0IHRoZSA8YXVkaW8+IGFuZCB0aGUgc3luY2VyL3VwZGF0ZXIgYXJlIHN0b3BwZWRcblx0XHRcdHZpZGVvLnBhdXNlKCk7XG5cblx0XHRcdC8vIHBsYXkgdmlkZW8gbmF0aXZlbHlcblx0XHRcdHZpZGVvW+CyoHBsYXldKCk7XG5cdFx0fSBlbHNlIGlmIChoYXNBdWRpbyAmJiAhcGxheWVyLmRyaXZlci5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHRcdC8vIGlmIHRoZSBmaXJzdCBwbGF5IGlzIG5hdGl2ZSxcblx0XHRcdC8vIHRoZSA8YXVkaW8+IG5lZWRzIHRvIGJlIGJ1ZmZlcmVkIG1hbnVhbGx5XG5cdFx0XHQvLyBzbyB3aGVuIHRoZSBmdWxsc2NyZWVuIGVuZHMsIGl0IGNhbiBiZSBzZXQgdG8gdGhlIHNhbWUgY3VycmVudCB0aW1lXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmxvYWQoKTtcblx0XHR9XG5cdH0pO1xuXHRpZiAoaGFzQXVkaW8pIHtcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRlbmRmdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gc3luYyBhdWRpbyB0byBuZXcgdmlkZW8gcG9zaXRpb25cblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPT09IHZpZGVvLmN1cnJlbnRUaW1lLCAnQXVkaW8gbm90IHN5bmNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYWxsb3cgc2Vla2luZ1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAobGFzdFJlcXVlc3RzLmluZGV4T2YodmlkZW8uY3VycmVudFRpbWUgKiAxMDAgfCAwIC8gMTAwKSA8IDApIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ1VzZXItcmVxdWVzdGVkIHNlZWtpbmcnKTtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHZpZGVvLmN1cnJlbnRUaW1lO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG92ZXJsb2FkQVBJKHZpZGVvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXHR2aWRlb1vgsqBwbGF5XSA9IHZpZGVvLnBsYXk7XG5cdHZpZGVvW+CyoHBhdXNlXSA9IHZpZGVvLnBhdXNlO1xuXHR2aWRlby5wbGF5ID0gcGxheTtcblx0dmlkZW8ucGF1c2UgPSBwYXVzZTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ3BhdXNlZCcsIHBsYXllci5kcml2ZXIpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnbXV0ZWQnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ3BsYXliYWNrUmF0ZScsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnZW5kZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2xvb3AnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2luZycpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdzZWVrZWQnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAndGltZXVwZGF0ZScsIOCyoGV2ZW50LCBmYWxzZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ2VuZGVkJywg4LKgZXZlbnQsIGZhbHNlKTsgLy8gcHJldmVudCBvY2Nhc2lvbmFsIG5hdGl2ZSBlbmRlZCBldmVudHNcbn1cblxuZnVuY3Rpb24gZW5hYmxlSW5saW5lVmlkZW8odmlkZW8sIGhhc0F1ZGlvLCBvbmx5V2hpdGVsaXN0ZWQpIHtcblx0aWYgKCBoYXNBdWRpbyA9PT0gdm9pZCAwICkgaGFzQXVkaW8gPSB0cnVlO1xuXHRpZiAoIG9ubHlXaGl0ZWxpc3RlZCA9PT0gdm9pZCAwICkgb25seVdoaXRlbGlzdGVkID0gdHJ1ZTtcblxuXHRpZiAoKG9ubHlXaGl0ZWxpc3RlZCAmJiAhaXNXaGl0ZWxpc3RlZCkgfHwgdmlkZW9b4LKgXSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKTtcblx0b3ZlcmxvYWRBUEkodmlkZW8pO1xuXHR2aWRlby5jbGFzc0xpc3QuYWRkKCdJSVYnKTtcblx0aWYgKCFoYXNBdWRpbyAmJiB2aWRlby5hdXRvcGxheSkge1xuXHRcdHZpZGVvLnBsYXkoKTtcblx0fVxuXHRpZiAoIS9pUGhvbmV8aVBvZHxpUGFkLy50ZXN0KG5hdmlnYXRvci5wbGF0Zm9ybSkpIHtcblx0XHRjb25zb2xlLndhcm4oJ2lwaG9uZS1pbmxpbmUtdmlkZW8gaXMgbm90IGd1YXJhbnRlZWQgdG8gd29yayBpbiBlbXVsYXRlZCBlbnZpcm9ubWVudHMnKTtcblx0fVxufVxuXG5lbmFibGVJbmxpbmVWaWRlby5pc1doaXRlbGlzdGVkID0gaXNXaGl0ZWxpc3RlZDtcblxubW9kdWxlLmV4cG9ydHMgPSBlbmFibGVJbmxpbmVWaWRlbzsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBpbmRleCA9IHR5cGVvZiBTeW1ib2wgPT09ICd1bmRlZmluZWQnID8gZnVuY3Rpb24gKGRlc2NyaXB0aW9uKSB7XG5cdHJldHVybiAnQCcgKyAoZGVzY3JpcHRpb24gfHwgJ0AnKSArIE1hdGgucmFuZG9tKCk7XG59IDogU3ltYm9sO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluZGV4OyIsIi8qKlxuICpcbiAqIChjKSBXZW5zaGVuZyBZYW4gPHlhbndzaEBnbWFpbC5jb20+XG4gKiBEYXRlOiAxMC8zMC8xNlxuICpcbiAqIEZvciB0aGUgZnVsbCBjb3B5cmlnaHQgYW5kIGxpY2Vuc2UgaW5mb3JtYXRpb24sIHBsZWFzZSB2aWV3IHRoZSBMSUNFTlNFXG4gKiBmaWxlIHRoYXQgd2FzIGRpc3RyaWJ1dGVkIHdpdGggdGhpcyBzb3VyY2UgY29kZS5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi4vbGliL0RldGVjdG9yJztcbmltcG9ydCBNb2JpbGVCdWZmZXJpbmcgZnJvbSAnLi4vbGliL01vYmlsZUJ1ZmZlcmluZyc7XG5cbmNvbnN0IEhBVkVfQ1VSUkVOVF9EQVRBID0gMjtcblxudmFyIEJhc2VDYW52YXMgPSBmdW5jdGlvbiAoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzID0ge30pIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncyA9IG9wdGlvbnM7XG4gICAgICAgICAgICAvL2Jhc2ljIHNldHRpbmdzXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gcGxheWVyLmVsKCkub2Zmc2V0V2lkdGgsIHRoaXMuaGVpZ2h0ID0gcGxheWVyLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5sb24gPSBvcHRpb25zLmluaXRMb24sIHRoaXMubGF0ID0gb3B0aW9ucy5pbml0TGF0LCB0aGlzLnBoaSA9IDAsIHRoaXMudGhldGEgPSAwO1xuICAgICAgICAgICAgdGhpcy52aWRlb1R5cGUgPSBvcHRpb25zLnZpZGVvVHlwZTtcbiAgICAgICAgICAgIHRoaXMuY2xpY2tUb1RvZ2dsZSA9IG9wdGlvbnMuY2xpY2tUb1RvZ2dsZTtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIHJlbmRlclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYXV0b0NsZWFyID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoMHgwMDAwMDAsIDEpO1xuXG4gICAgICAgICAgICAvL2RlZmluZSB0ZXh0dXJlLCBvbiBpZSAxMSwgd2UgbmVlZCBhZGRpdGlvbmFsIGhlbHBlciBjYW52YXMgdG8gc29sdmUgcmVuZGVyaW5nIGlzc3VlLlxuICAgICAgICAgICAgdmFyIHZpZGVvID0gc2V0dGluZ3MuZ2V0VGVjaChwbGF5ZXIpO1xuICAgICAgICAgICAgdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlID0gRGV0ZWN0b3Iuc3VwcG9ydFZpZGVvVGV4dHVyZSgpO1xuICAgICAgICAgICAgdGhpcy5saXZlU3RyZWFtT25TYWZhcmkgPSBEZXRlY3Rvci5pc0xpdmVTdHJlYW1PblNhZmFyaSh2aWRlbyk7XG4gICAgICAgICAgICBpZih0aGlzLmxpdmVTdHJlYW1PblNhZmFyaSkgdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlID0gZmFsc2U7XG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhlbHBlckNhbnZhcyA9IHBsYXllci5hZGRDaGlsZChcIkhlbHBlckNhbnZhc1wiLCB7XG4gICAgICAgICAgICAgICAgICAgIHZpZGVvOiB2aWRlbyxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHRoaXMud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogdGhpcy5oZWlnaHRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB2YXIgY29udGV4dCA9IHRoaXMuaGVscGVyQ2FudmFzLmVsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUoY29udGV4dCk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZSh2aWRlbyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZpZGVvLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcblxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5tYXhGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuXG4gICAgICAgICAgICB0aGlzLmVsXyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcbiAgICAgICAgICAgIHRoaXMuZWxfLmNsYXNzTGlzdC5hZGQoJ3Zqcy12aWRlby1jYW52YXMnKTtcblxuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IHRoaXMuZWxfO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHRoaXMuYXR0YWNoQ29udHJvbEV2ZW50cygpO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5vbihcInBsYXlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuYW5pbWF0ZSgpO1xuICAgICAgICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBhdHRhY2hDb250cm9sRXZlbnRzOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2Vtb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaG1vdmUnLCB0aGlzLmhhbmRsZU1vdXNlTW92ZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlZG93bicsIHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2hzdGFydCcsdGhpcy5oYW5kbGVNb3VzZURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXVwJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2hlbmQnLCB0aGlzLmhhbmRsZU1vdXNlVXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLnNjcm9sbGFibGUpe1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ21vdXNld2hlZWwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5vbignTW96TW91c2VQaXhlbFNjcm9sbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlZW50ZXInLCB0aGlzLmhhbmRsZU1vdXNlRW50ZXIuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWxlYXZlJywgdGhpcy5oYW5kbGVNb3VzZUxlYXNlLmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMucGxheWVyKCkuZWwoKS5vZmZzZXRXaWR0aCwgdGhpcy5oZWlnaHQgPSB0aGlzLnBsYXllcigpLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlVXA6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICBpZih0aGlzLmNsaWNrVG9Ub2dnbGUpe1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlggPSBNYXRoLmFicyhjbGllbnRYIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclgpO1xuICAgICAgICAgICAgICAgIHZhciBkaWZmWSA9IE1hdGguYWJzKGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSk7XG4gICAgICAgICAgICAgICAgaWYoZGlmZlggPCAwLjEgJiYgZGlmZlkgPCAwLjEpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkucGF1c2VkKCkgPyB0aGlzLnBsYXllcigpLnBsYXkoKSA6IHRoaXMucGxheWVyKCkucGF1c2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZURvd246IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICBpZih0eXBlb2YgY2xpZW50WCA9PT0gXCJ1bmRlZmluZWRcIiB8fCBjbGllbnRZID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCA9IGNsaWVudFg7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSA9IGNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Mb24gPSB0aGlzLmxvbjtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxhdCA9IHRoaXMubGF0O1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTW92ZTogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgaWYodHlwZW9mIGNsaWVudFggPT09IFwidW5kZWZpbmVkXCIgfHwgY2xpZW50WSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5jbGlja0FuZERyYWcpe1xuICAgICAgICAgICAgICAgIGlmKHRoaXMubW91c2VEb3duKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYIC0gY2xpZW50WCApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTG9uO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICggY2xpZW50WSAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZICkgKiAwLjIgKyB0aGlzLm9uUG9pbnRlckRvd25MYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHggPSBldmVudC5wYWdlWCAtIHRoaXMuZWxfLm9mZnNldExlZnQ7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBldmVudC5wYWdlWSAtIHRoaXMuZWxfLm9mZnNldFRvcDtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICh4IC8gdGhpcy53aWR0aCkgKiA0MzAgLSAyMjU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoeSAvIHRoaXMuaGVpZ2h0KSAqIC0xODAgKyA5MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb2JpbGVPcmllbnRhdGlvbjogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBpZih0eXBlb2YgZXZlbnQucm90YXRpb25SYXRlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnJvdGF0aW9uUmF0ZS5hbHBoYTtcbiAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucm90YXRpb25SYXRlLmJldGE7XG4gICAgICAgICAgICB2YXIgcG9ydHJhaXQgPSAodHlwZW9mIGV2ZW50LnBvcnRyYWl0ICE9PSBcInVuZGVmaW5lZFwiKT8gZXZlbnQucG9ydHJhaXQgOiB3aW5kb3cubWF0Y2hNZWRpYShcIihvcmllbnRhdGlvbjogcG9ydHJhaXQpXCIpLm1hdGNoZXM7XG4gICAgICAgICAgICB2YXIgbGFuZHNjYXBlID0gKHR5cGVvZiBldmVudC5sYW5kc2NhcGUgIT09IFwidW5kZWZpbmVkXCIpPyBldmVudC5sYW5kc2NhcGUgOiB3aW5kb3cubWF0Y2hNZWRpYShcIihvcmllbnRhdGlvbjogbGFuZHNjYXBlKVwiKS5tYXRjaGVzO1xuICAgICAgICAgICAgdmFyIG9yaWVudGF0aW9uID0gZXZlbnQub3JpZW50YXRpb24gfHwgd2luZG93Lm9yaWVudGF0aW9uO1xuXG4gICAgICAgICAgICBpZiAocG9ydHJhaXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IHRoaXMubG9uIC0geSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSB0aGlzLmxhdCArIHggKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgfWVsc2UgaWYobGFuZHNjYXBlKXtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50YXRpb25EZWdyZWUgPSAtOTA7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIG9yaWVudGF0aW9uICE9IFwidW5kZWZpbmVkXCIpe1xuICAgICAgICAgICAgICAgICAgICBvcmllbnRhdGlvbkRlZ3JlZSA9IG9yaWVudGF0aW9uO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKG9yaWVudGF0aW9uRGVncmVlID09IC05MCk/IHRoaXMubG9uICsgeCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWUgOiB0aGlzLmxvbiAtIHggKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKG9yaWVudGF0aW9uRGVncmVlID09IC05MCk/IHRoaXMubGF0ICsgeSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWUgOiB0aGlzLmxhdCAtIHkgKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlV2hlZWw6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUVudGVyOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTGVhc2U6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFuaW1hdGU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RBbmltYXRpb25JZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSggdGhpcy5hbmltYXRlLmJpbmQodGhpcykgKTtcbiAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllcigpLnBhdXNlZCgpKXtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YodGhpcy50ZXh0dXJlKSAhPT0gXCJ1bmRlZmluZWRcIiAmJiAoIXRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIoKS5yZWFkeVN0YXRlKCkgPj0gSEFWRV9DVVJSRU5UX0RBVEEgfHwgdGhpcy5pc1BsYXlPbk1vYmlsZSAmJiB0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBsYXlpbmdcIikpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3QgLSB0aGlzLnRpbWUgPj0gMzApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBjdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZih0aGlzLmlzUGxheU9uTW9iaWxlKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50VGltZSA9IHRoaXMucGxheWVyKCkuY3VycmVudFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKE1vYmlsZUJ1ZmZlcmluZy5pc0J1ZmZlcmluZyhjdXJyZW50VGltZSkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZih0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5yZW1vdmVDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGlmKCF0aGlzLmlzVXNlckludGVyYWN0aW5nKXtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTGF0ID0gKHRoaXMubGF0ID4gdGhpcy5zZXR0aW5ncy5pbml0TGF0KT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTG9uID0gKHRoaXMubG9uID4gdGhpcy5zZXR0aW5ncy5pbml0TG9uKT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmJhY2tUb1ZlcnRpY2FsQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA+ICh0aGlzLnNldHRpbmdzLmluaXRMYXQgLSBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQpKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPCAodGhpcy5zZXR0aW5ncy5pbml0TGF0ICsgTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0KSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5zZXR0aW5ncy5pbml0TGF0IDogdGhpcy5sYXQgKyB0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQgKiBzeW1ib2xMYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYmFja1RvSG9yaXpvbkNlbnRlcil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPiAodGhpcy5zZXR0aW5ncy5pbml0TG9uIC0gTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uKSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9uIDwgKHRoaXMuc2V0dGluZ3MuaW5pdExvbiArIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbikpXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMuc2V0dGluZ3MuaW5pdExvbiA6IHRoaXMubG9uICsgdGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uICogc3ltYm9sTG9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMubGF0ID0gTWF0aC5tYXgoIHRoaXMuc2V0dGluZ3MubWluTGF0LCBNYXRoLm1pbiggdGhpcy5zZXR0aW5ncy5tYXhMYXQsIHRoaXMubGF0ICkgKTtcbiAgICAgICAgICAgIHRoaXMubG9uID0gTWF0aC5tYXgoIHRoaXMuc2V0dGluZ3MubWluTG9uLCBNYXRoLm1pbiggdGhpcy5zZXR0aW5ncy5tYXhMb24sIHRoaXMubG9uICkgKTtcbiAgICAgICAgICAgIHRoaXMucGhpID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggOTAgLSB0aGlzLmxhdCApO1xuICAgICAgICAgICAgdGhpcy50aGV0YSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIHRoaXMubG9uICk7XG5cbiAgICAgICAgICAgIGlmKCF0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUpe1xuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzLnVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5jbGVhcigpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHBsYXlPbk1vYmlsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pc1BsYXlPbk1vYmlsZSA9IHRydWU7XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmF1dG9Nb2JpbGVPcmllbnRhdGlvbilcbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlbW90aW9uJywgdGhpcy5oYW5kbGVNb2JpbGVPcmllbnRhdGlvbi5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmVsXztcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IEJhc2VDYW52YXM7XG4iLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuXG5pbXBvcnQgQmFzZUNhbnZhcyBmcm9tICcuL0Jhc2VDYW52YXMnO1xuaW1wb3J0IFV0aWwgZnJvbSAnLi9VdGlsJztcblxudmFyIENhbnZhcyA9IGZ1bmN0aW9uIChiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MgPSB7fSkge1xuICAgIHZhciBwYXJlbnQgPSBCYXNlQ2FudmFzKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyk7XG5cbiAgICByZXR1cm4gVXRpbC5leHRlbmQocGFyZW50LCB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBwYXJlbnQuY29uc3RydWN0b3IuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgLy9kZWZpbmUgc2NlbmVcbiAgICAgICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEob3B0aW9ucy5pbml0Rm92LCB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDAsIDAsIDAgKTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgZ2VvbWV0cnlcbiAgICAgICAgICAgIHZhciBnZW9tZXRyeSA9ICh0aGlzLnZpZGVvVHlwZSA9PT0gXCJlcXVpcmVjdGFuZ3VsYXJcIik/IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSg1MDAsIDYwLCA0MCk6IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSggNTAwLCA2MCwgNDAgKS50b05vbkluZGV4ZWQoKTtcbiAgICAgICAgICAgIGlmKHRoaXMudmlkZW9UeXBlID09PSBcImZpc2hleWVcIil7XG4gICAgICAgICAgICAgICAgdmFyIG5vcm1hbHMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgICAgICB2YXIgdXZzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDAsIGwgPSBub3JtYWxzLmxlbmd0aCAvIDM7IGkgPCBsOyBpICsrICkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IG5vcm1hbHNbIGkgKiAzICsgMCBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeSA9IG5vcm1hbHNbIGkgKiAzICsgMSBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeiA9IG5vcm1hbHNbIGkgKiAzICsgMiBdO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciByID0gTWF0aC5hc2luKE1hdGguc3FydCh4ICogeCArIHogKiB6KSAvIE1hdGguc3FydCh4ICogeCAgKyB5ICogeSArIHogKiB6KSkgLyBNYXRoLlBJO1xuICAgICAgICAgICAgICAgICAgICBpZih5IDwgMCkgciA9IDEgLSByO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGhldGEgPSAoeCA9PSAwICYmIHogPT0gMCk/IDAgOiBNYXRoLmFjb3MoeCAvIE1hdGguc3FydCh4ICogeCArIHogKiB6KSk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHogPCAwKSB0aGV0YSA9IHRoZXRhICogLTE7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAwIF0gPSAtMC44ICogciAqIE1hdGguY29zKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDEgXSA9IDAuOCAqIHIgKiBNYXRoLnNpbih0aGV0YSkgKyAwLjU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVgoIG9wdGlvbnMucm90YXRlWCk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWSggb3B0aW9ucy5yb3RhdGVZKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVaKCBvcHRpb25zLnJvdGF0ZVopO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ2VvbWV0cnkuc2NhbGUoIC0gMSwgMSwgMSApO1xuICAgICAgICAgICAgLy9kZWZpbmUgbWVzaFxuICAgICAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0aGlzLnRleHR1cmV9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vdGhpcy5tZXNoLnNjYWxlLnggPSAtMTtcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMubWVzaCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZW5hYmxlVlI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuVlJNb2RlID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmKHR5cGVvZiB2ckhNRCAhPT0gJ3VuZGVmaW5lZCcpe1xuICAgICAgICAgICAgICAgIHZhciBleWVQYXJhbXNMID0gdnJITUQuZ2V0RXllUGFyYW1ldGVycyggJ2xlZnQnICk7XG4gICAgICAgICAgICAgICAgdmFyIGV5ZVBhcmFtc1IgPSB2ckhNRC5nZXRFeWVQYXJhbWV0ZXJzKCAncmlnaHQnICk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmV5ZUZPVkwgPSBleWVQYXJhbXNMLnJlY29tbWVuZGVkRmllbGRPZlZpZXc7XG4gICAgICAgICAgICAgICAgdGhpcy5leWVGT1ZSID0gZXllUGFyYW1zUi5yZWNvbW1lbmRlZEZpZWxkT2ZWaWV3O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEodGhpcy5jYW1lcmEuZm92LCB0aGlzLndpZHRoIC8yIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKHRoaXMuY2FtZXJhLmZvdiwgdGhpcy53aWR0aCAvMiAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgfSxcblxuICAgICAgICBkaXNhYmxlVlI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuVlJNb2RlID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZVJlc2l6ZS5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgaWYodGhpcy5WUk1vZGUpe1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5hc3BlY3QgPSB0aGlzLmNhbWVyYS5hc3BlY3QgLyAyO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5hc3BlY3QgPSB0aGlzLmNhbWVyYS5hc3BlY3QgLyAyO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBwYXJlbnQuaGFuZGxlTW91c2VXaGVlbChldmVudCk7XG4gICAgICAgICAgICAvLyBXZWJLaXRcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92IC09IGV2ZW50LndoZWVsRGVsdGFZICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBPcGVyYSAvIEV4cGxvcmVyIDlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LndoZWVsRGVsdGEgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92IC09IGV2ZW50LndoZWVsRGVsdGEgKiAwLjA1O1xuICAgICAgICAgICAgICAgIC8vIEZpcmVmb3hcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LmRldGFpbCApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgKz0gZXZlbnQuZGV0YWlsICogMS4wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5taW4odGhpcy5zZXR0aW5ncy5tYXhGb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgPSBNYXRoLm1heCh0aGlzLnNldHRpbmdzLm1pbkZvdiwgdGhpcy5jYW1lcmEuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIGlmKHRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuZm92ID0gdGhpcy5jYW1lcmEuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5mb3YgPSB0aGlzLmNhbWVyYS5mb3Y7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHBhcmVudC5yZW5kZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEubG9va0F0KCB0aGlzLmNhbWVyYS50YXJnZXQgKTtcblxuICAgICAgICAgICAgaWYoIXRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHZpZXdQb3J0V2lkdGggPSB0aGlzLndpZHRoIC8gMiwgdmlld1BvcnRIZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YgdnJITUQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZMLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZSLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxvbkwgPSB0aGlzLmxvbiArIHRoaXMuc2V0dGluZ3MuVlJHYXBEZWdyZWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb25SID0gdGhpcy5sb24gLSB0aGlzLnNldHRpbmdzLlZSR2FwRGVncmVlO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YUwgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25MICk7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YVIgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25SICk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldEwgPSBVdGlsLmRlZXBDb3B5KHRoaXMuY2FtZXJhLnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEwueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoZXRhTCApO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMLnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGV0YUwgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmxvb2tBdCh0YXJnZXRMKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0UiA9IFV0aWwuZGVlcENvcHkodGhpcy5jYW1lcmEudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ui54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhldGFSICk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFIueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoZXRhUiApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIubG9va0F0KHRhcmdldFIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyByZW5kZXIgbGVmdCBleWVcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3NvciggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmFMICk7XG5cbiAgICAgICAgICAgICAgICAvLyByZW5kZXIgcmlnaHQgZXllXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggdmlld1BvcnRXaWR0aCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhUiApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBDYW52YXM7XG4iLCIvKipcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXG4gKiBAYXV0aG9yIG1yLmRvb2IgLyBodHRwOi8vbXJkb29iLmNvbS9cbiAqL1xuXG52YXIgRGV0ZWN0b3IgPSB7XG5cbiAgICBjYW52YXM6ICEhIHdpbmRvdy5DYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gICAgd2ViZ2w6ICggZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHRyeSB7XG5cbiAgICAgICAgICAgIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnY2FudmFzJyApOyByZXR1cm4gISEgKCB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0ICYmICggY2FudmFzLmdldENvbnRleHQoICd3ZWJnbCcgKSB8fCBjYW52YXMuZ2V0Q29udGV4dCggJ2V4cGVyaW1lbnRhbC13ZWJnbCcgKSApICk7XG5cbiAgICAgICAgfSBjYXRjaCAoIGUgKSB7XG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICB9XG5cbiAgICB9ICkoKSxcbiAgICB3b3JrZXJzOiAhISB3aW5kb3cuV29ya2VyLFxuICAgIGZpbGVhcGk6IHdpbmRvdy5GaWxlICYmIHdpbmRvdy5GaWxlUmVhZGVyICYmIHdpbmRvdy5GaWxlTGlzdCAmJiB3aW5kb3cuQmxvYixcblxuICAgICBDaGVja19WZXJzaW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgIHZhciBydiA9IC0xOyAvLyBSZXR1cm4gdmFsdWUgYXNzdW1lcyBmYWlsdXJlLlxuXG4gICAgICAgICBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gJ01pY3Jvc29mdCBJbnRlcm5ldCBFeHBsb3JlcicpIHtcblxuICAgICAgICAgICAgIHZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQsXG4gICAgICAgICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChcIk1TSUUgKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcblxuICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICBydiA9IHBhcnNlRmxvYXQoUmVnRXhwLiQxKTtcbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICAgICBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSBcIk5ldHNjYXBlXCIpIHtcbiAgICAgICAgICAgICAvLy8gaW4gSUUgMTEgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIHNheXMgJ3RyaWRlbnQnXG4gICAgICAgICAgICAgLy8vIGluIEVkZ2UgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIGRvZXMgbm90IHNheSB0cmlkZW50XG4gICAgICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1RyaWRlbnQnKSAhPT0gLTEpIHJ2ID0gMTE7XG4gICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudDtcbiAgICAgICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cChcIkVkZ2VcXC8oWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuICAgICAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgfVxuXG4gICAgICAgICByZXR1cm4gcnY7XG4gICAgIH0sXG5cbiAgICBzdXBwb3J0VmlkZW9UZXh0dXJlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vaWUgMTEgYW5kIGVkZ2UgMTIgZG9lc24ndCBzdXBwb3J0IHZpZGVvIHRleHR1cmUuXG4gICAgICAgIHZhciB2ZXJzaW9uID0gdGhpcy5DaGVja19WZXJzaW9uKCk7XG4gICAgICAgIHJldHVybiAodmVyc2lvbiA9PT0gLTEgfHwgdmVyc2lvbiA+PSAxMyk7XG4gICAgfSxcblxuICAgIGlzTGl2ZVN0cmVhbU9uU2FmYXJpOiBmdW5jdGlvbiAodmlkZW9FbGVtZW50KSB7XG4gICAgICAgIC8vbGl2ZSBzdHJlYW0gb24gc2FmYXJpIGRvZXNuJ3Qgc3VwcG9ydCB2aWRlbyB0ZXh0dXJlXG4gICAgICAgIHZhciB2aWRlb1NvdXJjZXMgPSB2aWRlb0VsZW1lbnQucXVlcnlTZWxlY3RvckFsbChcInNvdXJjZVwiKTtcbiAgICAgICAgdmFyIHJlc3VsdCA9IGZhbHNlO1xuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgdmlkZW9Tb3VyY2VzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgICAgIHZhciBjdXJyZW50VmlkZW9Tb3VyY2UgPSB2aWRlb1NvdXJjZXNbaV07XG4gICAgICAgICAgICBpZigoY3VycmVudFZpZGVvU291cmNlLnR5cGUgPT0gXCJhcHBsaWNhdGlvbi94LW1wZWdVUkxcIiB8fCBjdXJyZW50VmlkZW9Tb3VyY2UudHlwZSA9PSBcImFwcGxpY2F0aW9uL3ZuZC5hcHBsZS5tcGVndXJsXCIpICYmIC9TYWZhcmkvLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkgJiYgL0FwcGxlIENvbXB1dGVyLy50ZXN0KG5hdmlnYXRvci52ZW5kb3IpKXtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgZ2V0V2ViR0xFcnJvck1lc3NhZ2U6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdkaXYnICk7XG4gICAgICAgIGVsZW1lbnQuaWQgPSAnd2ViZ2wtZXJyb3ItbWVzc2FnZSc7XG5cbiAgICAgICAgaWYgKCAhIHRoaXMud2ViZ2wgKSB7XG5cbiAgICAgICAgICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCA/IFtcbiAgICAgICAgICAgICAgICAnWW91ciBncmFwaGljcyBjYXJkIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+LjxiciAvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKSA6IFtcbiAgICAgICAgICAgICAgICAnWW91ciBicm93c2VyIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+Ljxici8+JyxcbiAgICAgICAgICAgICAgICAnRmluZCBvdXQgaG93IHRvIGdldCBpdCA8YSBocmVmPVwiaHR0cDovL2dldC53ZWJnbC5vcmcvXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+aGVyZTwvYT4uJ1xuICAgICAgICAgICAgXS5qb2luKCAnXFxuJyApO1xuXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudDtcblxuICAgIH0sXG5cbiAgICBhZGRHZXRXZWJHTE1lc3NhZ2U6IGZ1bmN0aW9uICggcGFyYW1ldGVycyApIHtcblxuICAgICAgICB2YXIgcGFyZW50LCBpZCwgZWxlbWVudDtcblxuICAgICAgICBwYXJhbWV0ZXJzID0gcGFyYW1ldGVycyB8fCB7fTtcblxuICAgICAgICBwYXJlbnQgPSBwYXJhbWV0ZXJzLnBhcmVudCAhPT0gdW5kZWZpbmVkID8gcGFyYW1ldGVycy5wYXJlbnQgOiBkb2N1bWVudC5ib2R5O1xuICAgICAgICBpZCA9IHBhcmFtZXRlcnMuaWQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMuaWQgOiAnb2xkaWUnO1xuXG4gICAgICAgIGVsZW1lbnQgPSBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpO1xuICAgICAgICBlbGVtZW50LmlkID0gaWQ7XG5cbiAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKCBlbGVtZW50ICk7XG5cbiAgICB9XG5cbn07XG5cbmV4cG9ydCBkZWZhdWx0IERldGVjdG9yOyIsIi8qKlxuICogQ3JlYXRlZCBieSB3ZW5zaGVuZy55YW4gb24gNS8yMy8xNi5cbiAqL1xudmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcbmVsZW1lbnQuY2xhc3NOYW1lID0gXCJ2anMtdmlkZW8taGVscGVyLWNhbnZhc1wiO1xuXG52YXIgSGVscGVyQ2FudmFzID0gZnVuY3Rpb24oYmFzZUNvbXBvbmVudCl7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHRoaXMudmlkZW9FbGVtZW50ID0gb3B0aW9ucy52aWRlbztcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSBvcHRpb25zLndpZHRoO1xuICAgICAgICAgICAgdGhpcy5oZWlnaHQgPSBvcHRpb25zLmhlaWdodDtcblxuICAgICAgICAgICAgZWxlbWVudC53aWR0aCA9IHRoaXMud2lkdGg7XG4gICAgICAgICAgICBlbGVtZW50LmhlaWdodCA9IHRoaXMuaGVpZ2h0O1xuICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgICAgICBvcHRpb25zLmVsID0gZWxlbWVudDtcblxuXG4gICAgICAgICAgICB0aGlzLmNvbnRleHQgPSBlbGVtZW50LmdldENvbnRleHQoJzJkJyk7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSxcbiAgICAgICAgXG4gICAgICAgIGdldENvbnRleHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb250ZXh0OyAgXG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICB1cGRhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5kcmF3SW1hZ2UodGhpcy52aWRlb0VsZW1lbnQsIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBIZWxwZXJDYW52YXM7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA2LzYvMTYuXG4gKi9cbnZhciBNb2JpbGVCdWZmZXJpbmcgPSB7XG4gICAgcHJldl9jdXJyZW50VGltZTogMCxcbiAgICBjb3VudGVyOiAwLFxuICAgIFxuICAgIGlzQnVmZmVyaW5nOiBmdW5jdGlvbiAoY3VycmVudFRpbWUpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lID09IHRoaXMucHJldl9jdXJyZW50VGltZSkgdGhpcy5jb3VudGVyKys7XG4gICAgICAgIGVsc2UgdGhpcy5jb3VudGVyID0gMDtcbiAgICAgICAgdGhpcy5wcmV2X2N1cnJlbnRUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgIGlmKHRoaXMuY291bnRlciA+IDEwKXtcbiAgICAgICAgICAgIC8vbm90IGxldCBjb3VudGVyIG92ZXJmbG93XG4gICAgICAgICAgICB0aGlzLmNvdW50ZXIgPSAxMDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBNb2JpbGVCdWZmZXJpbmc7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzQvMTYuXG4gKi9cblxudmFyIE5vdGljZSA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1ub3RpY2UtbGFiZWxcIjtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwib2JqZWN0XCIpe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgIH1lbHNlIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJzdHJpbmdcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IE5vdGljZTsiLCIvKipcbiAqXG4gKiAoYykgV2Vuc2hlbmcgWWFuIDx5YW53c2hAZ21haWwuY29tPlxuICogRGF0ZTogMTAvMjEvMTZcbiAqXG4gKiBGb3IgdGhlIGZ1bGwgY29weXJpZ2h0IGFuZCBsaWNlbnNlIGluZm9ybWF0aW9uLCBwbGVhc2UgdmlldyB0aGUgTElDRU5TRVxuICogZmlsZSB0aGF0IHdhcyBkaXN0cmlidXRlZCB3aXRoIHRoaXMgc291cmNlIGNvZGUuXG4gKi9cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IEJhc2VDYW52YXMgZnJvbSAnLi9CYXNlQ2FudmFzJztcbmltcG9ydCBVdGlsIGZyb20gJy4vVXRpbCc7XG5cbnZhciBUaHJlZURDYW52YXMgPSBmdW5jdGlvbiAoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzID0ge30pe1xuICAgIHZhciBwYXJlbnQgPSBCYXNlQ2FudmFzKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyk7XG4gICAgcmV0dXJuIFV0aWwuZXh0ZW5kKHBhcmVudCwge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgcGFyZW50LmNvbnN0cnVjdG9yLmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgc2NlbmVcbiAgICAgICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgICAgICAgICAgIHZhciBhc3BlY3RSYXRpbyA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodCAvIDI7XG4gICAgICAgICAgICAvL2RlZmluZSBjYW1lcmFcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTCA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShvcHRpb25zLmluaXRGb3YsIGFzcGVjdFJhdGlvLCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQgPSBuZXcgVEhSRUUuVmVjdG9yMyggMCwgMCwgMCApO1xuXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEob3B0aW9ucy5pbml0Rm92LCBhc3BlY3RSYXRpbywgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIucG9zaXRpb24uc2V0KCAxMDAwLCAwLCAwICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDEwMDAsIDAsIDAgKTtcblxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5TCA9IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSg1MDAsIDYwLCA0MCkudG9Ob25JbmRleGVkKCk7XG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnlSID0gbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KDUwMCwgNjAsIDQwKS50b05vbkluZGV4ZWQoKTtcblxuICAgICAgICAgICAgdmFyIHV2c0wgPSBnZW9tZXRyeUwuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgIHZhciBub3JtYWxzTCA9IGdlb21ldHJ5TC5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IG5vcm1hbHNMLmxlbmd0aCAvIDM7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgdXZzTFsgaSAqIDIgKyAxIF0gPSB1dnNMWyBpICogMiArIDEgXSAvIDI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB1dnNSID0gZ2VvbWV0cnlSLmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICB2YXIgbm9ybWFsc1IgPSBnZW9tZXRyeVIuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBub3JtYWxzUi5sZW5ndGggLyAzOyBpICsrICkge1xuICAgICAgICAgICAgICAgIHV2c1JbIGkgKiAyICsgMSBdID0gdXZzUlsgaSAqIDIgKyAxIF0gLyAyICsgMC41O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBnZW9tZXRyeUwuc2NhbGUoIC0gMSwgMSwgMSApO1xuICAgICAgICAgICAgZ2VvbWV0cnlSLnNjYWxlKCAtIDEsIDEsIDEgKTtcblxuICAgICAgICAgICAgdGhpcy5tZXNoTCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5TCxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICB0aGlzLm1lc2hSID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnlSLFxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aGlzLm1lc2hSLnBvc2l0aW9uLnNldCgxMDAwLCAwLCAwKTtcblxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoTCk7XG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLm1lc2hSKTtcblxuICAgICAgICAgICAgaWYob3B0aW9ucy5jYWxsYmFjaykgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZVJlc2l6ZS5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgdmFyIGFzcGVjdFJhdGlvID0gdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0IC8gMjtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5hc3BlY3QgPSBhc3BlY3RSYXRpbztcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5hc3BlY3QgPSBhc3BlY3RSYXRpbztcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlV2hlZWw6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVNb3VzZVdoZWVsKGV2ZW50KTtcbiAgICAgICAgICAgIC8vIFdlYktpdFxuICAgICAgICAgICAgaWYgKCBldmVudC53aGVlbERlbHRhWSApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuZm92IC09IGV2ZW50LndoZWVsRGVsdGFZICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBPcGVyYSAvIEV4cGxvcmVyIDlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LndoZWVsRGVsdGEgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBGaXJlZm94XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC5kZXRhaWwgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiArPSBldmVudC5kZXRhaWwgKiAxLjA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwuZm92ID0gTWF0aC5taW4odGhpcy5zZXR0aW5ncy5tYXhGb3YsIHRoaXMuY2FtZXJhTC5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IE1hdGgubWF4KHRoaXMuc2V0dGluZ3MubWluRm92LCB0aGlzLmNhbWVyYUwuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5mb3YgPSB0aGlzLmNhbWVyYUwuZm92O1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcGFyZW50LnJlbmRlci5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgdmFyIHZpZXdQb3J0V2lkdGggPSB0aGlzLndpZHRoIC8gMiwgdmlld1BvcnRIZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueSA9IDUwMCAqIE1hdGguY29zKCB0aGlzLnBoaSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmxvb2tBdCh0aGlzLmNhbWVyYUwudGFyZ2V0KTtcblxuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldC54ID0gMTAwMCArIDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi50YXJnZXQueSA9IDUwMCAqIE1hdGguY29zKCB0aGlzLnBoaSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmxvb2tBdCggdGhpcy5jYW1lcmFSLnRhcmdldCApO1xuXG4gICAgICAgICAgICAvLyByZW5kZXIgbGVmdCBleWVcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmFMICk7XG5cbiAgICAgICAgICAgIC8vIHJlbmRlciByaWdodCBleWVcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmFSICk7XG4gICAgICAgIH1cbiAgICB9KTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFRocmVlRENhbnZhczsiLCIvKipcbiAqIENyZWF0ZWQgYnkgd2Vuc2hlbmcueWFuIG9uIDQvNC8xNi5cbiAqL1xuZnVuY3Rpb24gd2hpY2hUcmFuc2l0aW9uRXZlbnQoKXtcbiAgICB2YXIgdDtcbiAgICB2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdmYWtlZWxlbWVudCcpO1xuICAgIHZhciB0cmFuc2l0aW9ucyA9IHtcbiAgICAgICAgJ3RyYW5zaXRpb24nOid0cmFuc2l0aW9uZW5kJyxcbiAgICAgICAgJ09UcmFuc2l0aW9uJzonb1RyYW5zaXRpb25FbmQnLFxuICAgICAgICAnTW96VHJhbnNpdGlvbic6J3RyYW5zaXRpb25lbmQnLFxuICAgICAgICAnV2Via2l0VHJhbnNpdGlvbic6J3dlYmtpdFRyYW5zaXRpb25FbmQnXG4gICAgfTtcblxuICAgIGZvcih0IGluIHRyYW5zaXRpb25zKXtcbiAgICAgICAgaWYoIGVsLnN0eWxlW3RdICE9PSB1bmRlZmluZWQgKXtcbiAgICAgICAgICAgIHJldHVybiB0cmFuc2l0aW9uc1t0XTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbW9iaWxlQW5kVGFibGV0Y2hlY2soKSB7XG4gICAgdmFyIGNoZWNrID0gZmFsc2U7XG4gICAgKGZ1bmN0aW9uKGEpe2lmKC8oYW5kcm9pZHxiYlxcZCt8bWVlZ28pLittb2JpbGV8YXZhbnRnb3xiYWRhXFwvfGJsYWNrYmVycnl8YmxhemVyfGNvbXBhbHxlbGFpbmV8ZmVubmVjfGhpcHRvcHxpZW1vYmlsZXxpcChob25lfG9kKXxpcmlzfGtpbmRsZXxsZ2UgfG1hZW1vfG1pZHB8bW1wfG1vYmlsZS4rZmlyZWZveHxuZXRmcm9udHxvcGVyYSBtKG9ifGluKWl8cGFsbSggb3MpP3xwaG9uZXxwKGl4aXxyZSlcXC98cGx1Y2tlcnxwb2NrZXR8cHNwfHNlcmllcyg0fDYpMHxzeW1iaWFufHRyZW98dXBcXC4oYnJvd3NlcnxsaW5rKXx2b2RhZm9uZXx3YXB8d2luZG93cyBjZXx4ZGF8eGlpbm98YW5kcm9pZHxpcGFkfHBsYXlib29rfHNpbGsvaS50ZXN0KGEpfHwvMTIwN3w2MzEwfDY1OTB8M2dzb3w0dGhwfDUwWzEtNl1pfDc3MHN8ODAyc3xhIHdhfGFiYWN8YWMoZXJ8b298c1xcLSl8YWkoa298cm4pfGFsKGF2fGNhfGNvKXxhbW9pfGFuKGV4fG55fHl3KXxhcHR1fGFyKGNofGdvKXxhcyh0ZXx1cyl8YXR0d3xhdShkaXxcXC1tfHIgfHMgKXxhdmFufGJlKGNrfGxsfG5xKXxiaShsYnxyZCl8YmwoYWN8YXopfGJyKGV8dil3fGJ1bWJ8YndcXC0obnx1KXxjNTVcXC98Y2FwaXxjY3dhfGNkbVxcLXxjZWxsfGNodG18Y2xkY3xjbWRcXC18Y28obXB8bmQpfGNyYXd8ZGEoaXR8bGx8bmcpfGRidGV8ZGNcXC1zfGRldml8ZGljYXxkbW9ifGRvKGN8cClvfGRzKDEyfFxcLWQpfGVsKDQ5fGFpKXxlbShsMnx1bCl8ZXIoaWN8azApfGVzbDh8ZXooWzQtN10wfG9zfHdhfHplKXxmZXRjfGZseShcXC18Xyl8ZzEgdXxnNTYwfGdlbmV8Z2ZcXC01fGdcXC1tb3xnbyhcXC53fG9kKXxncihhZHx1bil8aGFpZXxoY2l0fGhkXFwtKG18cHx0KXxoZWlcXC18aGkocHR8dGEpfGhwKCBpfGlwKXxoc1xcLWN8aHQoYyhcXC18IHxffGF8Z3xwfHN8dCl8dHApfGh1KGF3fHRjKXxpXFwtKDIwfGdvfG1hKXxpMjMwfGlhYyggfFxcLXxcXC8pfGlicm98aWRlYXxpZzAxfGlrb218aW0xa3xpbm5vfGlwYXF8aXJpc3xqYSh0fHYpYXxqYnJvfGplbXV8amlnc3xrZGRpfGtlaml8a2d0KCB8XFwvKXxrbG9ufGtwdCB8a3djXFwtfGt5byhjfGspfGxlKG5vfHhpKXxsZyggZ3xcXC8oa3xsfHUpfDUwfDU0fFxcLVthLXddKXxsaWJ3fGx5bnh8bTFcXC13fG0zZ2F8bTUwXFwvfG1hKHRlfHVpfHhvKXxtYygwMXwyMXxjYSl8bVxcLWNyfG1lKHJjfHJpKXxtaShvOHxvYXx0cyl8bW1lZnxtbygwMXwwMnxiaXxkZXxkb3x0KFxcLXwgfG98dil8enopfG10KDUwfHAxfHYgKXxtd2JwfG15d2F8bjEwWzAtMl18bjIwWzItM118bjMwKDB8Mil8bjUwKDB8Mnw1KXxuNygwKDB8MSl8MTApfG5lKChjfG0pXFwtfG9ufHRmfHdmfHdnfHd0KXxub2soNnxpKXxuenBofG8yaW18b3AodGl8d3YpfG9yYW58b3dnMXxwODAwfHBhbihhfGR8dCl8cGR4Z3xwZygxM3xcXC0oWzEtOF18YykpfHBoaWx8cGlyZXxwbChheXx1Yyl8cG5cXC0yfHBvKGNrfHJ0fHNlKXxwcm94fHBzaW98cHRcXC1nfHFhXFwtYXxxYygwN3wxMnwyMXwzMnw2MHxcXC1bMi03XXxpXFwtKXxxdGVrfHIzODB8cjYwMHxyYWtzfHJpbTl8cm8odmV8em8pfHM1NVxcL3xzYShnZXxtYXxtbXxtc3xueXx2YSl8c2MoMDF8aFxcLXxvb3xwXFwtKXxzZGtcXC98c2UoYyhcXC18MHwxKXw0N3xtY3xuZHxyaSl8c2doXFwtfHNoYXJ8c2llKFxcLXxtKXxza1xcLTB8c2woNDV8aWQpfHNtKGFsfGFyfGIzfGl0fHQ1KXxzbyhmdHxueSl8c3AoMDF8aFxcLXx2XFwtfHYgKXxzeSgwMXxtYil8dDIoMTh8NTApfHQ2KDAwfDEwfDE4KXx0YShndHxsayl8dGNsXFwtfHRkZ1xcLXx0ZWwoaXxtKXx0aW1cXC18dFxcLW1vfHRvKHBsfHNoKXx0cyg3MHxtXFwtfG0zfG01KXx0eFxcLTl8dXAoXFwuYnxnMXxzaSl8dXRzdHx2NDAwfHY3NTB8dmVyaXx2aShyZ3x0ZSl8dmsoNDB8NVswLTNdfFxcLXYpfHZtNDB8dm9kYXx2dWxjfHZ4KDUyfDUzfDYwfDYxfDcwfDgwfDgxfDgzfDg1fDk4KXx3M2MoXFwtfCApfHdlYmN8d2hpdHx3aShnIHxuY3xudyl8d21sYnx3b251fHg3MDB8eWFzXFwtfHlvdXJ8emV0b3x6dGVcXC0vaS50ZXN0KGEuc3Vic3RyKDAsNCkpKWNoZWNrID0gdHJ1ZX0pKG5hdmlnYXRvci51c2VyQWdlbnR8fG5hdmlnYXRvci52ZW5kb3J8fHdpbmRvdy5vcGVyYSk7XG4gICAgcmV0dXJuIGNoZWNrO1xufVxuXG5mdW5jdGlvbiBpc0lvcygpIHtcbiAgICByZXR1cm4gL2lQaG9uZXxpUGFkfGlQb2QvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpO1xufVxuXG5mdW5jdGlvbiBpc1JlYWxJcGhvbmUoKSB7XG4gICAgcmV0dXJuIC9pUGhvbmV8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnBsYXRmb3JtKTtcbn1cblxuLy9hZG9wdCBjb2RlIGZyb206IGh0dHBzOi8vZ2l0aHViLmNvbS9Nb3pWUi92ci13ZWItZXhhbXBsZXMvYmxvYi9tYXN0ZXIvdGhyZWVqcy12ci1ib2lsZXJwbGF0ZS9qcy9WUkVmZmVjdC5qc1xuZnVuY3Rpb24gZm92VG9ORENTY2FsZU9mZnNldCggZm92ICkge1xuICAgIHZhciBweHNjYWxlID0gMi4wIC8gKGZvdi5sZWZ0VGFuICsgZm92LnJpZ2h0VGFuKTtcbiAgICB2YXIgcHhvZmZzZXQgPSAoZm92LmxlZnRUYW4gLSBmb3YucmlnaHRUYW4pICogcHhzY2FsZSAqIDAuNTtcbiAgICB2YXIgcHlzY2FsZSA9IDIuMCAvIChmb3YudXBUYW4gKyBmb3YuZG93blRhbik7XG4gICAgdmFyIHB5b2Zmc2V0ID0gKGZvdi51cFRhbiAtIGZvdi5kb3duVGFuKSAqIHB5c2NhbGUgKiAwLjU7XG4gICAgcmV0dXJuIHsgc2NhbGU6IFsgcHhzY2FsZSwgcHlzY2FsZSBdLCBvZmZzZXQ6IFsgcHhvZmZzZXQsIHB5b2Zmc2V0IF0gfTtcbn1cblxuZnVuY3Rpb24gZm92UG9ydFRvUHJvamVjdGlvbiggZm92LCByaWdodEhhbmRlZCwgek5lYXIsIHpGYXIgKSB7XG5cbiAgICByaWdodEhhbmRlZCA9IHJpZ2h0SGFuZGVkID09PSB1bmRlZmluZWQgPyB0cnVlIDogcmlnaHRIYW5kZWQ7XG4gICAgek5lYXIgPSB6TmVhciA9PT0gdW5kZWZpbmVkID8gMC4wMSA6IHpOZWFyO1xuICAgIHpGYXIgPSB6RmFyID09PSB1bmRlZmluZWQgPyAxMDAwMC4wIDogekZhcjtcblxuICAgIHZhciBoYW5kZWRuZXNzU2NhbGUgPSByaWdodEhhbmRlZCA/IC0xLjAgOiAxLjA7XG5cbiAgICAvLyBzdGFydCB3aXRoIGFuIGlkZW50aXR5IG1hdHJpeFxuICAgIHZhciBtb2JqID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgICB2YXIgbSA9IG1vYmouZWxlbWVudHM7XG5cbiAgICAvLyBhbmQgd2l0aCBzY2FsZS9vZmZzZXQgaW5mbyBmb3Igbm9ybWFsaXplZCBkZXZpY2UgY29vcmRzXG4gICAgdmFyIHNjYWxlQW5kT2Zmc2V0ID0gZm92VG9ORENTY2FsZU9mZnNldChmb3YpO1xuXG4gICAgLy8gWCByZXN1bHQsIG1hcCBjbGlwIGVkZ2VzIHRvIFstdywrd11cbiAgICBtWzAgKiA0ICsgMF0gPSBzY2FsZUFuZE9mZnNldC5zY2FsZVswXTtcbiAgICBtWzAgKiA0ICsgMV0gPSAwLjA7XG4gICAgbVswICogNCArIDJdID0gc2NhbGVBbmRPZmZzZXQub2Zmc2V0WzBdICogaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMCAqIDQgKyAzXSA9IDAuMDtcblxuICAgIC8vIFkgcmVzdWx0LCBtYXAgY2xpcCBlZGdlcyB0byBbLXcsK3ddXG4gICAgLy8gWSBvZmZzZXQgaXMgbmVnYXRlZCBiZWNhdXNlIHRoaXMgcHJvaiBtYXRyaXggdHJhbnNmb3JtcyBmcm9tIHdvcmxkIGNvb3JkcyB3aXRoIFk9dXAsXG4gICAgLy8gYnV0IHRoZSBOREMgc2NhbGluZyBoYXMgWT1kb3duICh0aGFua3MgRDNEPylcbiAgICBtWzEgKiA0ICsgMF0gPSAwLjA7XG4gICAgbVsxICogNCArIDFdID0gc2NhbGVBbmRPZmZzZXQuc2NhbGVbMV07XG4gICAgbVsxICogNCArIDJdID0gLXNjYWxlQW5kT2Zmc2V0Lm9mZnNldFsxXSAqIGhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzEgKiA0ICsgM10gPSAwLjA7XG5cbiAgICAvLyBaIHJlc3VsdCAodXAgdG8gdGhlIGFwcClcbiAgICBtWzIgKiA0ICsgMF0gPSAwLjA7XG4gICAgbVsyICogNCArIDFdID0gMC4wO1xuICAgIG1bMiAqIDQgKyAyXSA9IHpGYXIgLyAoek5lYXIgLSB6RmFyKSAqIC1oYW5kZWRuZXNzU2NhbGU7XG4gICAgbVsyICogNCArIDNdID0gKHpGYXIgKiB6TmVhcikgLyAoek5lYXIgLSB6RmFyKTtcblxuICAgIC8vIFcgcmVzdWx0ICg9IFogaW4pXG4gICAgbVszICogNCArIDBdID0gMC4wO1xuICAgIG1bMyAqIDQgKyAxXSA9IDAuMDtcbiAgICBtWzMgKiA0ICsgMl0gPSBoYW5kZWRuZXNzU2NhbGU7XG4gICAgbVszICogNCArIDNdID0gMC4wO1xuXG4gICAgbW9iai50cmFuc3Bvc2UoKTtcblxuICAgIHJldHVybiBtb2JqO1xufVxuXG5mdW5jdGlvbiBmb3ZUb1Byb2plY3Rpb24oIGZvdiwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICkge1xuICAgIHZhciBERUcyUkFEID0gTWF0aC5QSSAvIDE4MC4wO1xuXG4gICAgdmFyIGZvdlBvcnQgPSB7XG4gICAgICAgIHVwVGFuOiBNYXRoLnRhbiggZm92LnVwRGVncmVlcyAqIERFRzJSQUQgKSxcbiAgICAgICAgZG93blRhbjogTWF0aC50YW4oIGZvdi5kb3duRGVncmVlcyAqIERFRzJSQUQgKSxcbiAgICAgICAgbGVmdFRhbjogTWF0aC50YW4oIGZvdi5sZWZ0RGVncmVlcyAqIERFRzJSQUQgKSxcbiAgICAgICAgcmlnaHRUYW46IE1hdGgudGFuKCBmb3YucmlnaHREZWdyZWVzICogREVHMlJBRCApXG4gICAgfTtcblxuICAgIHJldHVybiBmb3ZQb3J0VG9Qcm9qZWN0aW9uKCBmb3ZQb3J0LCByaWdodEhhbmRlZCwgek5lYXIsIHpGYXIgKTtcbn1cblxuZnVuY3Rpb24gZXh0ZW5kKHN1cGVyQ2xhc3MsIHN1YkNsYXNzTWV0aG9kcyA9IHt9KVxue1xuICAgIGZvcih2YXIgbWV0aG9kIGluIHN1cGVyQ2xhc3Mpe1xuICAgICAgICBpZihzdXBlckNsYXNzLmhhc093blByb3BlcnR5KG1ldGhvZCkgJiYgIXN1YkNsYXNzTWV0aG9kcy5oYXNPd25Qcm9wZXJ0eShtZXRob2QpKXtcbiAgICAgICAgICAgIHN1YkNsYXNzTWV0aG9kc1ttZXRob2RdID0gc3VwZXJDbGFzc1ttZXRob2RdO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdWJDbGFzc01ldGhvZHM7XG59XG5cbmZ1bmN0aW9uIGRlZXBDb3B5KG9iaikge1xuICAgIHZhciB0byA9IHt9O1xuXG4gICAgZm9yICh2YXIgbmFtZSBpbiBvYmopXG4gICAge1xuICAgICAgICB0b1tuYW1lXSA9IG9ialtuYW1lXTtcbiAgICB9XG5cbiAgICByZXR1cm4gdG87XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgICB3aGljaFRyYW5zaXRpb25FdmVudDogd2hpY2hUcmFuc2l0aW9uRXZlbnQsXG4gICAgbW9iaWxlQW5kVGFibGV0Y2hlY2s6IG1vYmlsZUFuZFRhYmxldGNoZWNrLFxuICAgIGlzSW9zOiBpc0lvcyxcbiAgICBpc1JlYWxJcGhvbmU6IGlzUmVhbElwaG9uZSxcbiAgICBmb3ZUb1Byb2plY3Rpb246IGZvdlRvUHJvamVjdGlvbixcbiAgICBleHRlbmQ6IGV4dGVuZCxcbiAgICBkZWVwQ29weTogZGVlcENvcHlcbn07IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA4LzEzLzE2LlxuICovXG5cbnZhciBWUkJ1dHRvbiA9IGZ1bmN0aW9uKEJ1dHRvbkNvbXBvbmVudCl7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIEJ1dHRvbkNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYnVpbGRDU1NDbGFzczogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gYHZqcy1WUi1jb250cm9sICR7QnV0dG9uQ29tcG9uZW50LnByb3RvdHlwZS5idWlsZENTU0NsYXNzLmNhbGwodGhpcyl9YDtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVDbGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGNhbnZhcyA9IHRoaXMucGxheWVyKCkuZ2V0Q2hpbGQoXCJDYW52YXNcIik7XG4gICAgICAgICAgICAoIWNhbnZhcy5WUk1vZGUpPyBjYW52YXMuZW5hYmxlVlIoKSA6IGNhbnZhcy5kaXNhYmxlVlIoKTtcbiAgICAgICAgICAgIChjYW52YXMuVlJNb2RlKT8gdGhpcy5hZGRDbGFzcyhcImVuYWJsZVwiKSA6IHRoaXMucmVtb3ZlQ2xhc3MoXCJlbmFibGVcIik7XG4gICAgICAgICAgICAoY2FudmFzLlZSTW9kZSk/ICB0aGlzLnBsYXllcigpLnRyaWdnZXIoJ1ZSTW9kZU9uJyk6ICB0aGlzLnBsYXllcigpLnRyaWdnZXIoJ1ZSTW9kZU9mZicpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNvbnRyb2xUZXh0XzogXCJWUlwiXG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgVlJCdXR0b247IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzMvMTYuXG4gKi9cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IHV0aWwgZnJvbSAnLi9saWIvVXRpbCc7XG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi9saWIvRGV0ZWN0b3InO1xuaW1wb3J0IG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lIGZyb20gJ2lwaG9uZS1pbmxpbmUtdmlkZW8nO1xuXG5jb25zdCBydW5Pbk1vYmlsZSA9ICh1dGlsLm1vYmlsZUFuZFRhYmxldGNoZWNrKCkpO1xuXG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHRoZSBwbHVnaW4uXG5jb25zdCBkZWZhdWx0cyA9IHtcbiAgICBjbGlja0FuZERyYWc6IHJ1bk9uTW9iaWxlLFxuICAgIHNob3dOb3RpY2U6IHRydWUsXG4gICAgTm90aWNlTWVzc2FnZTogXCJQbGVhc2UgdXNlIHlvdXIgbW91c2UgZHJhZyBhbmQgZHJvcCB0aGUgdmlkZW8uXCIsXG4gICAgYXV0b0hpZGVOb3RpY2U6IDMwMDAsXG4gICAgLy9saW1pdCB0aGUgdmlkZW8gc2l6ZSB3aGVuIHVzZXIgc2Nyb2xsLlxuICAgIHNjcm9sbGFibGU6IHRydWUsXG4gICAgaW5pdEZvdjogNzUsXG4gICAgbWF4Rm92OiAxMDUsXG4gICAgbWluRm92OiA1MSxcbiAgICAvL2luaXRpYWwgcG9zaXRpb24gZm9yIHRoZSB2aWRlb1xuICAgIGluaXRMYXQ6IDAsXG4gICAgaW5pdExvbjogLTE4MCxcbiAgICAvL0EgZmxvYXQgdmFsdWUgYmFjayB0byBjZW50ZXIgd2hlbiBtb3VzZSBvdXQgdGhlIGNhbnZhcy4gVGhlIGhpZ2hlciwgdGhlIGZhc3Rlci5cbiAgICByZXR1cm5TdGVwTGF0OiAwLjUsXG4gICAgcmV0dXJuU3RlcExvbjogMixcbiAgICBiYWNrVG9WZXJ0aWNhbENlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGJhY2tUb0hvcml6b25DZW50ZXI6ICFydW5Pbk1vYmlsZSxcbiAgICBjbGlja1RvVG9nZ2xlOiBmYWxzZSxcblxuICAgIC8vbGltaXQgdmlld2FibGUgem9vbVxuICAgIG1pbkxhdDogLTg1LFxuICAgIG1heExhdDogODUsXG5cbiAgICBtaW5Mb246IC1JbmZpbml0eSxcbiAgICBtYXhMb246IEluZmluaXR5LFxuXG4gICAgdmlkZW9UeXBlOiBcImVxdWlyZWN0YW5ndWxhclwiLFxuXG4gICAgcm90YXRlWDogMCxcbiAgICByb3RhdGVZOiAwLFxuICAgIHJvdGF0ZVo6IDAsXG5cbiAgICBhdXRvTW9iaWxlT3JpZW50YXRpb246IGZhbHNlLFxuICAgIG1vYmlsZVZpYnJhdGlvblZhbHVlOiB1dGlsLmlzSW9zKCk/IDAuMDIyIDogMSxcblxuICAgIFZSRW5hYmxlOiB0cnVlLFxuICAgIFZSR2FwRGVncmVlOiAyLjUsXG5cbiAgICBjbG9zZVBhbm9yYW1hOiBmYWxzZVxuXG5cbn07XG5cbmZ1bmN0aW9uIHBsYXllclJlc2l6ZShwbGF5ZXIpe1xuICAgIHZhciBjYW52YXMgPSBwbGF5ZXIuZ2V0Q2hpbGQoJ0NhbnZhcycpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHBsYXllci5lbCgpLnN0eWxlLndpZHRoID0gd2luZG93LmlubmVyV2lkdGggKyBcInB4XCI7XG4gICAgICAgIHBsYXllci5lbCgpLnN0eWxlLmhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodCArIFwicHhcIjtcbiAgICAgICAgY2FudmFzLmhhbmRsZVJlc2l6ZSgpO1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIGZ1bGxzY3JlZW5PbklPUyhwbGF5ZXIsIGNsaWNrRm4pIHtcbiAgICB2YXIgcmVzaXplRm4gPSBwbGF5ZXJSZXNpemUocGxheWVyKTtcbiAgICBwbGF5ZXIuY29udHJvbEJhci5mdWxsc2NyZWVuVG9nZ2xlLm9mZihcInRhcFwiLCBjbGlja0ZuKTtcbiAgICBwbGF5ZXIuY29udHJvbEJhci5mdWxsc2NyZWVuVG9nZ2xlLm9uKFwidGFwXCIsIGZ1bmN0aW9uIGZ1bGxzY3JlZW4oKSB7XG4gICAgICAgIHZhciBjYW52YXMgPSBwbGF5ZXIuZ2V0Q2hpbGQoJ0NhbnZhcycpO1xuICAgICAgICBpZighcGxheWVyLmlzRnVsbHNjcmVlbigpKXtcbiAgICAgICAgICAgIC8vc2V0IHRvIGZ1bGxzY3JlZW5cbiAgICAgICAgICAgIHBsYXllci5pc0Z1bGxzY3JlZW4odHJ1ZSk7XG4gICAgICAgICAgICBwbGF5ZXIuZW50ZXJGdWxsV2luZG93KCk7XG4gICAgICAgICAgICByZXNpemVGbigpO1xuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJkZXZpY2Vtb3Rpb25cIiwgcmVzaXplRm4pO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHBsYXllci5pc0Z1bGxzY3JlZW4oZmFsc2UpO1xuICAgICAgICAgICAgcGxheWVyLmV4aXRGdWxsV2luZG93KCk7XG4gICAgICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS53aWR0aCA9IFwiXCI7XG4gICAgICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS5oZWlnaHQgPSBcIlwiO1xuICAgICAgICAgICAgY2FudmFzLmhhbmRsZVJlc2l6ZSgpO1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJkZXZpY2Vtb3Rpb25cIiwgcmVzaXplRm4pO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbi8qKlxuICogRnVuY3Rpb24gdG8gaW52b2tlIHdoZW4gdGhlIHBsYXllciBpcyByZWFkeS5cbiAqXG4gKiBUaGlzIGlzIGEgZ3JlYXQgcGxhY2UgZm9yIHlvdXIgcGx1Z2luIHRvIGluaXRpYWxpemUgaXRzZWxmLiBXaGVuIHRoaXNcbiAqIGZ1bmN0aW9uIGlzIGNhbGxlZCwgdGhlIHBsYXllciB3aWxsIGhhdmUgaXRzIERPTSBhbmQgY2hpbGQgY29tcG9uZW50c1xuICogaW4gcGxhY2UuXG4gKlxuICogQGZ1bmN0aW9uIG9uUGxheWVyUmVhZHlcbiAqIEBwYXJhbSAgICB7UGxheWVyfSBwbGF5ZXJcbiAqIEBwYXJhbSAgICB7T2JqZWN0fSBbb3B0aW9ucz17fV1cbiAqL1xuY29uc3Qgb25QbGF5ZXJSZWFkeSA9IChwbGF5ZXIsIG9wdGlvbnMsIHNldHRpbmdzKSA9PiB7XG4gICAgcGxheWVyLmFkZENsYXNzKCd2anMtcGFub3JhbWEnKTtcbiAgICBpZighRGV0ZWN0b3Iud2ViZ2wpe1xuICAgICAgICBQb3B1cE5vdGlmaWNhdGlvbihwbGF5ZXIsIHtcbiAgICAgICAgICAgIE5vdGljZU1lc3NhZ2U6IERldGVjdG9yLmdldFdlYkdMRXJyb3JNZXNzYWdlKCksXG4gICAgICAgICAgICBhdXRvSGlkZU5vdGljZTogb3B0aW9ucy5hdXRvSGlkZU5vdGljZVxuICAgICAgICB9KTtcbiAgICAgICAgaWYob3B0aW9ucy5jYWxsYmFjayl7XG4gICAgICAgICAgICBvcHRpb25zLmNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBwbGF5ZXIuYWRkQ2hpbGQoJ0NhbnZhcycsIHV0aWwuZGVlcENvcHkob3B0aW9ucykpO1xuICAgIHZhciBjYW52YXMgPSBwbGF5ZXIuZ2V0Q2hpbGQoJ0NhbnZhcycpO1xuICAgIGlmKHJ1bk9uTW9iaWxlKXtcbiAgICAgICAgdmFyIHZpZGVvRWxlbWVudCA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcbiAgICAgICAgaWYodXRpbC5pc1JlYWxJcGhvbmUoKSl7XG4gICAgICAgICAgICAvL2lvcyAxMCBzdXBwb3J0IHBsYXkgdmlkZW8gaW5saW5lXG4gICAgICAgICAgICB2aWRlb0VsZW1lbnQuc2V0QXR0cmlidXRlKFwicGxheXNpbmxpbmVcIiwgXCJcIik7XG4gICAgICAgICAgICBtYWtlVmlkZW9QbGF5YWJsZUlubGluZSh2aWRlb0VsZW1lbnQsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHV0aWwuaXNJb3MoKSl7XG4gICAgICAgICAgICBmdWxsc2NyZWVuT25JT1MocGxheWVyLCBzZXR0aW5ncy5nZXRGdWxsc2NyZWVuVG9nZ2xlQ2xpY2tGbihwbGF5ZXIpKTtcbiAgICAgICAgfVxuICAgICAgICBwbGF5ZXIuYWRkQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlb1wiKTtcbiAgICAgICAgcGxheWVyLnJlbW92ZUNsYXNzKFwidmpzLXVzaW5nLW5hdGl2ZS1jb250cm9sc1wiKTtcbiAgICAgICAgY2FudmFzLnBsYXlPbk1vYmlsZSgpO1xuICAgIH1cbiAgICBpZihvcHRpb25zLnNob3dOb3RpY2Upe1xuICAgICAgICBwbGF5ZXIub24oXCJwbGF5aW5nXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBQb3B1cE5vdGlmaWNhdGlvbihwbGF5ZXIsIHV0aWwuZGVlcENvcHkob3B0aW9ucykpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYob3B0aW9ucy5WUkVuYWJsZSAmJiBvcHRpb25zLnZpZGVvVHlwZSAhPT0gXCIzZFZpZGVvXCIpe1xuICAgICAgICBwbGF5ZXIuY29udHJvbEJhci5hZGRDaGlsZCgnVlJCdXR0b24nLCB7fSwgcGxheWVyLmNvbnRyb2xCYXIuY2hpbGRyZW4oKS5sZW5ndGggLSAxKTtcbiAgICB9XG4gICAgY2FudmFzLmhpZGUoKTtcbiAgICBwbGF5ZXIub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2FudmFzLnNob3coKTtcbiAgICB9KTtcbiAgICBwbGF5ZXIub24oXCJmdWxsc2NyZWVuY2hhbmdlXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2FudmFzLmhhbmRsZVJlc2l6ZSgpO1xuICAgIH0pO1xuICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcbn07XG5cbmNvbnN0IFBvcHVwTm90aWZpY2F0aW9uID0gKHBsYXllciwgb3B0aW9ucyA9IHtcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlwiXG59KSA9PiB7XG4gICAgdmFyIG5vdGljZSA9IHBsYXllci5hZGRDaGlsZCgnTm90aWNlJywgb3B0aW9ucyk7XG5cbiAgICBpZihvcHRpb25zLmF1dG9IaWRlTm90aWNlID4gMCl7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbm90aWNlLmFkZENsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgdmFyIHRyYW5zaXRpb25FdmVudCA9IHV0aWwud2hpY2hUcmFuc2l0aW9uRXZlbnQoKTtcbiAgICAgICAgICAgIHZhciBoaWRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgbm90aWNlLnJlbW92ZUNsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5vZmYodHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBub3RpY2Uub24odHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgfSwgb3B0aW9ucy5hdXRvSGlkZU5vdGljZSk7XG4gICAgfVxufTtcblxuY29uc3QgcGx1Z2luID0gZnVuY3Rpb24oc2V0dGluZ3MgPSB7fSl7XG4gICAgLyoqXG4gICAgICogQSB2aWRlby5qcyBwbHVnaW4uXG4gICAgICpcbiAgICAgKiBJbiB0aGUgcGx1Z2luIGZ1bmN0aW9uLCB0aGUgdmFsdWUgb2YgYHRoaXNgIGlzIGEgdmlkZW8uanMgYFBsYXllcmBcbiAgICAgKiBpbnN0YW5jZS4gWW91IGNhbm5vdCByZWx5IG9uIHRoZSBwbGF5ZXIgYmVpbmcgaW4gYSBcInJlYWR5XCIgc3RhdGUgaGVyZSxcbiAgICAgKiBkZXBlbmRpbmcgb24gaG93IHRoZSBwbHVnaW4gaXMgaW52b2tlZC4gVGhpcyBtYXkgb3IgbWF5IG5vdCBiZSBpbXBvcnRhbnRcbiAgICAgKiB0byB5b3U7IGlmIG5vdCwgcmVtb3ZlIHRoZSB3YWl0IGZvciBcInJlYWR5XCIhXG4gICAgICpcbiAgICAgKiBAZnVuY3Rpb24gcGFub3JhbWFcbiAgICAgKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gICAgICogICAgICAgICAgIEFuIG9iamVjdCBvZiBvcHRpb25zIGxlZnQgdG8gdGhlIHBsdWdpbiBhdXRob3IgdG8gZGVmaW5lLlxuICAgICAqL1xuICAgIGNvbnN0IHZpZGVvVHlwZXMgPSBbXCJlcXVpcmVjdGFuZ3VsYXJcIiwgXCJmaXNoZXllXCIsIFwiM2RWaWRlb1wiXTtcbiAgICBjb25zdCBwYW5vcmFtYSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgaWYoc2V0dGluZ3MubWVyZ2VPcHRpb24pIG9wdGlvbnMgPSBzZXR0aW5ncy5tZXJnZU9wdGlvbihkZWZhdWx0cywgb3B0aW9ucyk7XG4gICAgICAgIGlmKHR5cGVvZiBzZXR0aW5ncy5faW5pdCA9PT0gXCJ1bmRlZmluZWRcIiB8fCB0eXBlb2Ygc2V0dGluZ3MuX2luaXQgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcInBsdWdpbiBtdXN0IGltcGxlbWVudCBpbml0IGZ1bmN0aW9uKCkuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmKHZpZGVvVHlwZXMuaW5kZXhPZihvcHRpb25zLnZpZGVvVHlwZSkgPT0gLTEpIG9wdGlvbnMudmlkZW9UeXBlID0gZGVmYXVsdHMudmlkZW9UeXBlO1xuICAgICAgICBzZXR0aW5ncy5faW5pdChvcHRpb25zKTtcbiAgICAgICAgLyogaW1wbGVtZW50IGNhbGxiYWNrIGZ1bmN0aW9uIHdoZW4gdmlkZW9qcyBpcyByZWFkeSAqL1xuICAgICAgICB0aGlzLnJlYWR5KCgpID0+IHtcbiAgICAgICAgICAgIG9uUGxheWVyUmVhZHkodGhpcywgb3B0aW9ucywgc2V0dGluZ3MpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4vLyBJbmNsdWRlIHRoZSB2ZXJzaW9uIG51bWJlci5cbiAgICBwYW5vcmFtYS5WRVJTSU9OID0gJzAuMS4zJztcblxuICAgIHJldHVybiBwYW5vcmFtYTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IHBsdWdpbjtcbiIsIid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IENhbnZhcyAgZnJvbSAnLi9saWIvQ2FudmFzJztcbmltcG9ydCBUaHJlZURDYW52YXMgZnJvbSAnLi9saWIvVGhyZWVDYW52YXMnO1xuaW1wb3J0IE5vdGljZSAgZnJvbSAnLi9saWIvTm90aWNlJztcbmltcG9ydCBIZWxwZXJDYW52YXMgZnJvbSAnLi9saWIvSGVscGVyQ2FudmFzJztcbmltcG9ydCBWUkJ1dHRvbiBmcm9tICcuL2xpYi9WUkJ1dHRvbic7XG5pbXBvcnQgcGFub3JhbWEgZnJvbSAnLi9wbHVnaW4nO1xuXG5mdW5jdGlvbiBnZXRUZWNoKHBsYXllcikge1xuICAgIHJldHVybiBwbGF5ZXIudGVjaCh7IElXaWxsTm90VXNlVGhpc0luUGx1Z2luczogdHJ1ZSB9KS5lbCgpO1xufVxuXG5mdW5jdGlvbiBnZXRGdWxsc2NyZWVuVG9nZ2xlQ2xpY2tGbihwbGF5ZXIpIHtcbiAgICByZXR1cm4gcGxheWVyLmNvbnRyb2xCYXIuZnVsbHNjcmVlblRvZ2dsZS5oYW5kbGVDbGlja1xufVxuXG52YXIgY29tcG9uZW50ID0gdmlkZW9qcy5nZXRDb21wb25lbnQoJ0NvbXBvbmVudCcpO1xuXG52YXIgbm90aWNlID0gTm90aWNlKGNvbXBvbmVudCk7XG52aWRlb2pzLnJlZ2lzdGVyQ29tcG9uZW50KCdOb3RpY2UnLCB2aWRlb2pzLmV4dGVuZChjb21wb25lbnQsIG5vdGljZSkpO1xuXG52YXIgaGVscGVyQ2FudmFzID0gSGVscGVyQ2FudmFzKGNvbXBvbmVudCk7XG52aWRlb2pzLnJlZ2lzdGVyQ29tcG9uZW50KCdIZWxwZXJDYW52YXMnLCB2aWRlb2pzLmV4dGVuZChjb21wb25lbnQsIGhlbHBlckNhbnZhcykpO1xuXG52YXIgYnV0dG9uID0gdmlkZW9qcy5nZXRDb21wb25lbnQoXCJCdXR0b25cIik7XG52YXIgdnJCdG4gPSBWUkJ1dHRvbihidXR0b24pO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnVlJCdXR0b24nLCB2aWRlb2pzLmV4dGVuZChidXR0b24sIHZyQnRuKSk7XG5cbi8vIFJlZ2lzdGVyIHRoZSBwbHVnaW4gd2l0aCB2aWRlby5qcy5cbnZpZGVvanMucGx1Z2luKCdwYW5vcmFtYScsIHBhbm9yYW1hKHtcbiAgICBfaW5pdDogZnVuY3Rpb24ob3B0aW9ucyl7XG4gICAgICAgIHZhciBjYW52YXMgPSAob3B0aW9ucy52aWRlb1R5cGUgIT09IFwiM2RWaWRlb1wiKT9cbiAgICAgICAgICAgIENhbnZhcyhjb21wb25lbnQsIHdpbmRvdy5USFJFRSwge1xuICAgICAgICAgICAgICAgIGdldFRlY2g6IGdldFRlY2hcbiAgICAgICAgICAgIH0pIDpcbiAgICAgICAgICAgIFRocmVlRENhbnZhcyhjb21wb25lbnQsIHdpbmRvdy5USFJFRSwge1xuICAgICAgICAgICAgICAgIGdldFRlY2g6IGdldFRlY2hcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB2aWRlb2pzLnJlZ2lzdGVyQ29tcG9uZW50KCdDYW52YXMnLCB2aWRlb2pzLmV4dGVuZChjb21wb25lbnQsIGNhbnZhcykpO1xuICAgIH0sXG4gICAgbWVyZ2VPcHRpb246IGZ1bmN0aW9uIChkZWZhdWx0cywgb3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdmlkZW9qcy5tZXJnZU9wdGlvbnMoZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgIH0sXG4gICAgZ2V0VGVjaDogZ2V0VGVjaCxcbiAgICBnZXRGdWxsc2NyZWVuVG9nZ2xlQ2xpY2tGbjogZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm5cbn0pKTtcbiJdfQ==
