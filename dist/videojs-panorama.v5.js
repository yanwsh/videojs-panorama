(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*! npm.im/iphone-inline-video */
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var Symbol = _interopDefault(require('poor-mans-symbol'));

function Intervalometer(cb) {
	var rafId;
	var previousLoopTime;
	function loop(now) {
		// must be requested before cb() because that might call .stop()
		rafId = requestAnimationFrame(loop);
		cb(now - (previousLoopTime || now)); // ms since last call. 0 on start()
		previousLoopTime = now;
	}
	this.start = function () {
		if (!rafId) { // prevent double starts
			loop(0);
		}
	};
	this.stop = function () {
		cancelAnimationFrame(rafId);
		rafId = null;
		previousLoopTime = 0;
	};
}

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
// Also adds unprefixed css-grid. This check essentially excludes
var isWhitelisted = /iPhone|iPod/i.test(navigator.userAgent) && document.head.style.grid === undefined;

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
			player.driver.currentTime = player.video.currentTime + (timeDiff * player.video.playbackRate) / 1000;
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
	player.updater = new Intervalometer(update.bind(player));

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
	if (navigator.platform === 'MacIntel' || navigator.platform === 'Windows') {
		console.warn('iphone-inline-video is not guaranteed to work in emulated environments');
	}
}

enableInlineVideo.isWhitelisted = isWhitelisted;

module.exports = enableInlineVideo;
},{"poor-mans-symbol":2}],2:[function(require,module,exports){
'use strict';

var index = typeof Symbol === 'undefined' ? function (description) {
	return '@' + (description || '@') + Math.random();
} : Symbol;

module.exports = index;
},{}],3:[function(require,module,exports){
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

var HAVE_ENOUGH_DATA = 4;

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
                if (typeof this.texture !== "undefined" && (!this.isPlayOnMobile && this.player().readyState() === HAVE_ENOUGH_DATA || this.isPlayOnMobile && this.player().hasClass("vjs-playing"))) {
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

},{"../lib/Detector":5,"../lib/MobileBuffering":7}],4:[function(require,module,exports){
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

},{"./BaseCanvas":3,"./Util":10}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

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

},{}],9:[function(require,module,exports){
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

},{"./BaseCanvas":3,"./Util":10}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
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
    panorama.VERSION = '0.1.0';

    return panorama;
};

exports.default = plugin;

},{"./lib/Detector":5,"./lib/Util":10,"iphone-inline-video":1}],13:[function(require,module,exports){
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

},{"./lib/Canvas":4,"./lib/HelperCanvas":6,"./lib/Notice":8,"./lib/ThreeCanvas":9,"./lib/VRButton":11,"./plugin":12}]},{},[13])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwibm9kZV9tb2R1bGVzL3Bvb3ItbWFucy1zeW1ib2wvZGlzdC9wb29yLW1hbnMtc3ltYm9sLmNvbW1vbi1qcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9CYXNlQ2FudmFzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9UaHJlZUNhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvbGliL1ZSQnV0dG9uLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y1LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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S0FiK0I7QUFjaEMsYUFBUyxPQWR1QjtBQWVoQyxnQ0FBNEI7QUFmSSxDQUFULENBQTNCIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qISBucG0uaW0vaXBob25lLWlubGluZS12aWRlbyAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBfaW50ZXJvcERlZmF1bHQgKGV4KSB7IHJldHVybiAoZXggJiYgKHR5cGVvZiBleCA9PT0gJ29iamVjdCcpICYmICdkZWZhdWx0JyBpbiBleCkgPyBleFsnZGVmYXVsdCddIDogZXg7IH1cblxudmFyIFN5bWJvbCA9IF9pbnRlcm9wRGVmYXVsdChyZXF1aXJlKCdwb29yLW1hbnMtc3ltYm9sJykpO1xuXG5mdW5jdGlvbiBJbnRlcnZhbG9tZXRlcihjYikge1xuXHR2YXIgcmFmSWQ7XG5cdHZhciBwcmV2aW91c0xvb3BUaW1lO1xuXHRmdW5jdGlvbiBsb29wKG5vdykge1xuXHRcdC8vIG11c3QgYmUgcmVxdWVzdGVkIGJlZm9yZSBjYigpIGJlY2F1c2UgdGhhdCBtaWdodCBjYWxsIC5zdG9wKClcblx0XHRyYWZJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblx0XHRjYihub3cgLSAocHJldmlvdXNMb29wVGltZSB8fCBub3cpKTsgLy8gbXMgc2luY2UgbGFzdCBjYWxsLiAwIG9uIHN0YXJ0KClcblx0XHRwcmV2aW91c0xvb3BUaW1lID0gbm93O1xuXHR9XG5cdHRoaXMuc3RhcnQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCFyYWZJZCkgeyAvLyBwcmV2ZW50IGRvdWJsZSBzdGFydHNcblx0XHRcdGxvb3AoMCk7XG5cdFx0fVxuXHR9O1xuXHR0aGlzLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG5cdFx0Y2FuY2VsQW5pbWF0aW9uRnJhbWUocmFmSWQpO1xuXHRcdHJhZklkID0gbnVsbDtcblx0XHRwcmV2aW91c0xvb3BUaW1lID0gMDtcblx0fTtcbn1cblxuZnVuY3Rpb24gcHJldmVudEV2ZW50KGVsZW1lbnQsIGV2ZW50TmFtZSwgdG9nZ2xlUHJvcGVydHksIHByZXZlbnRXaXRoUHJvcGVydHkpIHtcblx0ZnVuY3Rpb24gaGFuZGxlcihlKSB7XG5cdFx0aWYgKEJvb2xlYW4oZWxlbWVudFt0b2dnbGVQcm9wZXJ0eV0pID09PSBCb29sZWFuKHByZXZlbnRXaXRoUHJvcGVydHkpKSB7XG5cdFx0XHRlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0Ly8gY29uc29sZS5sb2coZXZlbnROYW1lLCAncHJldmVudGVkIG9uJywgZWxlbWVudCk7XG5cdFx0fVxuXHRcdGRlbGV0ZSBlbGVtZW50W3RvZ2dsZVByb3BlcnR5XTtcblx0fVxuXHRlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBoYW5kbGVyLCBmYWxzZSk7XG5cblx0Ly8gUmV0dXJuIGhhbmRsZXIgdG8gYWxsb3cgdG8gZGlzYWJsZSB0aGUgcHJldmVudGlvbi4gVXNhZ2U6XG5cdC8vIGNvbnN0IHByZXZlbnRpb25IYW5kbGVyID0gcHJldmVudEV2ZW50KGVsLCAnY2xpY2snKTtcblx0Ly8gZWwucmVtb3ZlRXZlbnRIYW5kbGVyKCdjbGljaycsIHByZXZlbnRpb25IYW5kbGVyKTtcblx0cmV0dXJuIGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHByb3h5UHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHNvdXJjZU9iamVjdCwgY29weUZpcnN0KSB7XG5cdGZ1bmN0aW9uIGdldCgpIHtcblx0XHRyZXR1cm4gc291cmNlT2JqZWN0W3Byb3BlcnR5TmFtZV07XG5cdH1cblx0ZnVuY3Rpb24gc2V0KHZhbHVlKSB7XG5cdFx0c291cmNlT2JqZWN0W3Byb3BlcnR5TmFtZV0gPSB2YWx1ZTtcblx0fVxuXG5cdGlmIChjb3B5Rmlyc3QpIHtcblx0XHRzZXQob2JqZWN0W3Byb3BlcnR5TmFtZV0pO1xuXHR9XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iamVjdCwgcHJvcGVydHlOYW1lLCB7Z2V0OiBnZXQsIHNldDogc2V0fSk7XG59XG5cbmZ1bmN0aW9uIHByb3h5RXZlbnQob2JqZWN0LCBldmVudE5hbWUsIHNvdXJjZU9iamVjdCkge1xuXHRzb3VyY2VPYmplY3QuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGZ1bmN0aW9uICgpIHsgcmV0dXJuIG9iamVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChldmVudE5hbWUpKTsgfSk7XG59XG5cbmZ1bmN0aW9uIGRpc3BhdGNoRXZlbnRBc3luYyhlbGVtZW50LCB0eXBlKSB7XG5cdFByb21pc2UucmVzb2x2ZSgpLnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQodHlwZSkpO1xuXHR9KTtcbn1cblxuLy8gaU9TIDEwIGFkZHMgc3VwcG9ydCBmb3IgbmF0aXZlIGlubGluZSBwbGF5YmFjayArIHNpbGVudCBhdXRvcGxheVxuLy8gQWxzbyBhZGRzIHVucHJlZml4ZWQgY3NzLWdyaWQuIFRoaXMgY2hlY2sgZXNzZW50aWFsbHkgZXhjbHVkZXNcbnZhciBpc1doaXRlbGlzdGVkID0gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSAmJiBkb2N1bWVudC5oZWFkLnN0eWxlLmdyaWQgPT09IHVuZGVmaW5lZDtcblxudmFyIOCyoCA9IFN5bWJvbCgpO1xudmFyIOCyoGV2ZW50ID0gU3ltYm9sKCk7XG52YXIg4LKgcGxheSA9IFN5bWJvbCgnbmF0aXZlcGxheScpO1xudmFyIOCyoHBhdXNlID0gU3ltYm9sKCduYXRpdmVwYXVzZScpO1xuXG4vKipcbiAqIFVUSUxTXG4gKi9cblxuZnVuY3Rpb24gZ2V0QXVkaW9Gcm9tVmlkZW8odmlkZW8pIHtcblx0dmFyIGF1ZGlvID0gbmV3IEF1ZGlvKCk7XG5cdHByb3h5RXZlbnQodmlkZW8sICdwbGF5JywgYXVkaW8pO1xuXHRwcm94eUV2ZW50KHZpZGVvLCAncGxheWluZycsIGF1ZGlvKTtcblx0cHJveHlFdmVudCh2aWRlbywgJ3BhdXNlJywgYXVkaW8pO1xuXHRhdWRpby5jcm9zc09yaWdpbiA9IHZpZGVvLmNyb3NzT3JpZ2luO1xuXG5cdC8vICdkYXRhOicgY2F1c2VzIGF1ZGlvLm5ldHdvcmtTdGF0ZSA+IDBcblx0Ly8gd2hpY2ggdGhlbiBhbGxvd3MgdG8ga2VlcCA8YXVkaW8+IGluIGEgcmVzdW1hYmxlIHBsYXlpbmcgc3RhdGVcblx0Ly8gaS5lLiBvbmNlIHlvdSBzZXQgYSByZWFsIHNyYyBpdCB3aWxsIGtlZXAgcGxheWluZyBpZiBpdCB3YXMgaWYgLnBsYXkoKSB3YXMgY2FsbGVkXG5cdGF1ZGlvLnNyYyA9IHZpZGVvLnNyYyB8fCB2aWRlby5jdXJyZW50U3JjIHx8ICdkYXRhOic7XG5cblx0Ly8gaWYgKGF1ZGlvLnNyYyA9PT0gJ2RhdGE6Jykge1xuXHQvLyAgIFRPRE86IHdhaXQgZm9yIHZpZGVvIHRvIGJlIHNlbGVjdGVkXG5cdC8vIH1cblx0cmV0dXJuIGF1ZGlvO1xufVxuXG52YXIgbGFzdFJlcXVlc3RzID0gW107XG52YXIgcmVxdWVzdEluZGV4ID0gMDtcbnZhciBsYXN0VGltZXVwZGF0ZUV2ZW50O1xuXG5mdW5jdGlvbiBzZXRUaW1lKHZpZGVvLCB0aW1lLCByZW1lbWJlck9ubHkpIHtcblx0Ly8gYWxsb3cgb25lIHRpbWV1cGRhdGUgZXZlbnQgZXZlcnkgMjAwKyBtc1xuXHRpZiAoKGxhc3RUaW1ldXBkYXRlRXZlbnQgfHwgMCkgKyAyMDAgPCBEYXRlLm5vdygpKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHRsYXN0VGltZXVwZGF0ZUV2ZW50ID0gRGF0ZS5ub3coKTtcblx0fVxuXHRpZiAoIXJlbWVtYmVyT25seSkge1xuXHRcdHZpZGVvLmN1cnJlbnRUaW1lID0gdGltZTtcblx0fVxuXHRsYXN0UmVxdWVzdHNbKytyZXF1ZXN0SW5kZXggJSAzXSA9IHRpbWUgKiAxMDAgfCAwIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBpc1BsYXllckVuZGVkKHBsYXllcikge1xuXHRyZXR1cm4gcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA+PSBwbGF5ZXIudmlkZW8uZHVyYXRpb247XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZSh0aW1lRGlmZikge1xuXHR2YXIgcGxheWVyID0gdGhpcztcblx0Ly8gY29uc29sZS5sb2coJ3VwZGF0ZScsIHBsYXllci52aWRlby5yZWFkeVN0YXRlLCBwbGF5ZXIudmlkZW8ubmV0d29ya1N0YXRlLCBwbGF5ZXIuZHJpdmVyLnJlYWR5U3RhdGUsIHBsYXllci5kcml2ZXIubmV0d29ya1N0YXRlLCBwbGF5ZXIuZHJpdmVyLnBhdXNlZCk7XG5cdGlmIChwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSA+PSBwbGF5ZXIudmlkZW8uSEFWRV9GVVRVUkVfREFUQSkge1xuXHRcdGlmICghcGxheWVyLmhhc0F1ZGlvKSB7XG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gcGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lICsgKHRpbWVEaWZmICogcGxheWVyLnZpZGVvLnBsYXliYWNrUmF0ZSkgLyAxMDAwO1xuXHRcdFx0aWYgKHBsYXllci52aWRlby5sb29wICYmIGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0c2V0VGltZShwbGF5ZXIudmlkZW8sIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUpO1xuXHR9IGVsc2UgaWYgKHBsYXllci52aWRlby5uZXR3b3JrU3RhdGUgPT09IHBsYXllci52aWRlby5ORVRXT1JLX0lETEUgJiYgIXBsYXllci52aWRlby5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHQvLyB0aGlzIHNob3VsZCBoYXBwZW4gd2hlbiB0aGUgc291cmNlIGlzIGF2YWlsYWJsZSBidXQ6XG5cdFx0Ly8gLSBpdCdzIHBvdGVudGlhbGx5IHBsYXlpbmcgKC5wYXVzZWQgPT09IGZhbHNlKVxuXHRcdC8vIC0gaXQncyBub3QgcmVhZHkgdG8gcGxheVxuXHRcdC8vIC0gaXQncyBub3QgbG9hZGluZ1xuXHRcdC8vIElmIGl0IGhhc0F1ZGlvLCB0aGF0IHdpbGwgYmUgbG9hZGVkIGluIHRoZSAnZW1wdGllZCcgaGFuZGxlciBiZWxvd1xuXHRcdHBsYXllci52aWRlby5sb2FkKCk7XG5cdFx0Ly8gY29uc29sZS5sb2coJ1dpbGwgbG9hZCcpO1xuXHR9XG5cblx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lID09PSBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lLCAnVmlkZW8gbm90IHVwZGF0aW5nIScpO1xuXG5cdGlmIChwbGF5ZXIudmlkZW8uZW5kZWQpIHtcblx0XHRkZWxldGUgcGxheWVyLnZpZGVvW+CyoGV2ZW50XTsgLy8gYWxsb3cgdGltZXVwZGF0ZSBldmVudFxuXHRcdHBsYXllci52aWRlby5wYXVzZSh0cnVlKTtcblx0fVxufVxuXG4vKipcbiAqIE1FVEhPRFNcbiAqL1xuXG5mdW5jdGlvbiBwbGF5KCkge1xuXHQvLyBjb25zb2xlLmxvZygncGxheScpO1xuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHVzZSB0aGUgbmF0aXZlIHBsYXllclxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmIChwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gJ2RhdGE6JyAmJiBwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gdmlkZW8uc3JjKSB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkIG9uIHBsYXknLCB2aWRlby5zcmMpO1xuXHRcdHNldFRpbWUodmlkZW8sIDAsIHRydWUpO1xuXHRcdHBsYXllci5kcml2ZXIuc3JjID0gdmlkZW8uc3JjO1xuXHR9XG5cblx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cGxheWVyLnBhdXNlZCA9IGZhbHNlO1xuXG5cdGlmICghdmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0Ly8gLmxvYWQoKSBjYXVzZXMgdGhlIGVtcHRpZWQgZXZlbnRcblx0XHQvLyB0aGUgYWx0ZXJuYXRpdmUgaXMgLnBsYXkoKSsucGF1c2UoKSBidXQgdGhhdCB0cmlnZ2VycyBwbGF5L3BhdXNlIGV2ZW50cywgZXZlbiB3b3JzZVxuXHRcdC8vIHBvc3NpYmx5IHRoZSBhbHRlcm5hdGl2ZSBpcyBwcmV2ZW50aW5nIHRoaXMgZXZlbnQgb25seSBvbmNlXG5cdFx0dmlkZW8ubG9hZCgpO1xuXHR9XG5cblx0cGxheWVyLmRyaXZlci5wbGF5KCk7XG5cdHBsYXllci51cGRhdGVyLnN0YXJ0KCk7XG5cblx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5Jyk7XG5cdFx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0VOT1VHSF9EQVRBKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnb25wbGF5Jyk7XG5cdFx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5aW5nJyk7XG5cdFx0fVxuXHR9XG59XG5mdW5jdGlvbiBwYXVzZShmb3JjZUV2ZW50cykge1xuXHQvLyBjb25zb2xlLmxvZygncGF1c2UnKTtcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0cGxheWVyLmRyaXZlci5wYXVzZSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdG9wKCk7XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB0aGUgZGV2ZWxvcGVyIHRoZSBuYXRpdmUgcGxheWVyLnBhdXNlKClcblx0Ly8gVGhpcyBpcyBhdCB0aGUgZW5kIG9mIHBhdXNlKCkgYmVjYXVzZSBpdCBhbHNvXG5cdC8vIG5lZWRzIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBzaW11bGF0aW9uIGlzIHBhdXNlZFxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwYXVzZV0oKTtcblx0fVxuXG5cdGlmIChwbGF5ZXIucGF1c2VkICYmICFmb3JjZUV2ZW50cykge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHBsYXllci5wYXVzZWQgPSB0cnVlO1xuXHRpZiAoIXBsYXllci5oYXNBdWRpbykge1xuXHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ3BhdXNlJyk7XG5cdH1cblx0aWYgKHZpZGVvLmVuZGVkKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdlbmRlZCcpO1xuXHR9XG59XG5cbi8qKlxuICogU0VUVVBcbiAqL1xuXG5mdW5jdGlvbiBhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdID0ge307XG5cdHBsYXllci5wYXVzZWQgPSB0cnVlOyAvLyB0cmFjayB3aGV0aGVyICdwYXVzZScgZXZlbnRzIGhhdmUgYmVlbiBmaXJlZFxuXHRwbGF5ZXIuaGFzQXVkaW8gPSBoYXNBdWRpbztcblx0cGxheWVyLnZpZGVvID0gdmlkZW87XG5cdHBsYXllci51cGRhdGVyID0gbmV3IEludGVydmFsb21ldGVyKHVwZGF0ZS5iaW5kKHBsYXllcikpO1xuXG5cdGlmIChoYXNBdWRpbykge1xuXHRcdHBsYXllci5kcml2ZXIgPSBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbyk7XG5cdH0gZWxzZSB7XG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignY2FucGxheScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdvbmNhbnBsYXknKTtcblx0XHRcdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGxheWluZycpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHBsYXllci5kcml2ZXIgPSB7XG5cdFx0XHRzcmM6IHZpZGVvLnNyYyB8fCB2aWRlby5jdXJyZW50U3JjIHx8ICdkYXRhOicsXG5cdFx0XHRtdXRlZDogdHJ1ZSxcblx0XHRcdHBhdXNlZDogdHJ1ZSxcblx0XHRcdHBhdXNlOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGF1c2VkID0gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRwbGF5OiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGF1c2VkID0gZmFsc2U7XG5cdFx0XHRcdC8vIG1lZGlhIGF1dG9tYXRpY2FsbHkgZ29lcyB0byAwIGlmIC5wbGF5KCkgaXMgY2FsbGVkIHdoZW4gaXQncyBkb25lXG5cdFx0XHRcdGlmIChpc1BsYXllckVuZGVkKHBsYXllcikpIHtcblx0XHRcdFx0XHRzZXRUaW1lKHZpZGVvLCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGdldCBlbmRlZCgpIHtcblx0XHRcdFx0cmV0dXJuIGlzUGxheWVyRW5kZWQocGxheWVyKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Ly8gLmxvYWQoKSBjYXVzZXMgdGhlIGVtcHRpZWQgZXZlbnRcblx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignZW1wdGllZCcsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBjb25zb2xlLmxvZygnZHJpdmVyIHNyYyBpcycsIHBsYXllci5kcml2ZXIuc3JjKTtcblx0XHR2YXIgd2FzRW1wdHkgPSAhcGxheWVyLmRyaXZlci5zcmMgfHwgcGxheWVyLmRyaXZlci5zcmMgPT09ICdkYXRhOic7XG5cdFx0aWYgKHBsYXllci5kcml2ZXIuc3JjICYmIHBsYXllci5kcml2ZXIuc3JjICE9PSB2aWRlby5zcmMpIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKCdzcmMgY2hhbmdlZCB0bycsIHZpZGVvLnNyYyk7XG5cdFx0XHRzZXRUaW1lKHZpZGVvLCAwLCB0cnVlKTtcblx0XHRcdHBsYXllci5kcml2ZXIuc3JjID0gdmlkZW8uc3JjO1xuXHRcdFx0Ly8gcGxheWluZyB2aWRlb3Mgd2lsbCBvbmx5IGtlZXAgcGxheWluZyBpZiBubyBzcmMgd2FzIHByZXNlbnQgd2hlbiAucGxheSgp4oCZZWRcblx0XHRcdGlmICh3YXNFbXB0eSkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBsYXkoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBsYXllci51cGRhdGVyLnN0b3AoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sIGZhbHNlKTtcblxuXHQvLyBzdG9wIHByb2dyYW1tYXRpYyBwbGF5ZXIgd2hlbiBPUyB0YWtlcyBvdmVyXG5cdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGJlZ2luZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdFx0Ly8gbWFrZSBzdXJlIHRoYXQgdGhlIDxhdWRpbz4gYW5kIHRoZSBzeW5jZXIvdXBkYXRlciBhcmUgc3RvcHBlZFxuXHRcdFx0dmlkZW8ucGF1c2UoKTtcblxuXHRcdFx0Ly8gcGxheSB2aWRlbyBuYXRpdmVseVxuXHRcdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHR9IGVsc2UgaWYgKGhhc0F1ZGlvICYmICFwbGF5ZXIuZHJpdmVyLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdFx0Ly8gaWYgdGhlIGZpcnN0IHBsYXkgaXMgbmF0aXZlLFxuXHRcdFx0Ly8gdGhlIDxhdWRpbz4gbmVlZHMgdG8gYmUgYnVmZmVyZWQgbWFudWFsbHlcblx0XHRcdC8vIHNvIHdoZW4gdGhlIGZ1bGxzY3JlZW4gZW5kcywgaXQgY2FuIGJlIHNldCB0byB0aGUgc2FtZSBjdXJyZW50IHRpbWVcblx0XHRcdHBsYXllci5kcml2ZXIubG9hZCgpO1xuXHRcdH1cblx0fSk7XG5cdGlmIChoYXNBdWRpbykge1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGVuZGZ1bGxzY3JlZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBzeW5jIGF1ZGlvIHRvIG5ldyB2aWRlbyBwb3NpdGlvblxuXHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHZpZGVvLmN1cnJlbnRUaW1lO1xuXHRcdFx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9PT0gdmlkZW8uY3VycmVudFRpbWUsICdBdWRpbyBub3Qgc3luY2VkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBhbGxvdyBzZWVraW5nXG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmIChsYXN0UmVxdWVzdHMuaW5kZXhPZih2aWRlby5jdXJyZW50VGltZSAqIDEwMCB8IDAgLyAxMDApIDwgMCkge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnVXNlci1yZXF1ZXN0ZWQgc2Vla2luZycpO1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gb3ZlcmxvYWRBUEkodmlkZW8pIHtcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cdHZpZGVvW+CyoHBsYXldID0gdmlkZW8ucGxheTtcblx0dmlkZW9b4LKgcGF1c2VdID0gdmlkZW8ucGF1c2U7XG5cdHZpZGVvLnBsYXkgPSBwbGF5O1xuXHR2aWRlby5wYXVzZSA9IHBhdXNlO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAncGF1c2VkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdtdXRlZCcsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAncGxheWJhY2tSYXRlJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdlbmRlZCcsIHBsYXllci5kcml2ZXIpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnbG9vcCcsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdzZWVraW5nJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtlZCcpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICd0aW1ldXBkYXRlJywg4LKgZXZlbnQsIGZhbHNlKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnZW5kZWQnLCDgsqBldmVudCwgZmFsc2UpOyAvLyBwcmV2ZW50IG9jY2FzaW9uYWwgbmF0aXZlIGVuZGVkIGV2ZW50c1xufVxuXG5mdW5jdGlvbiBlbmFibGVJbmxpbmVWaWRlbyh2aWRlbywgaGFzQXVkaW8sIG9ubHlXaGl0ZWxpc3RlZCkge1xuXHRpZiAoIGhhc0F1ZGlvID09PSB2b2lkIDAgKSBoYXNBdWRpbyA9IHRydWU7XG5cdGlmICggb25seVdoaXRlbGlzdGVkID09PSB2b2lkIDAgKSBvbmx5V2hpdGVsaXN0ZWQgPSB0cnVlO1xuXG5cdGlmICgob25seVdoaXRlbGlzdGVkICYmICFpc1doaXRlbGlzdGVkKSB8fCB2aWRlb1vgsqBdKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGFkZFBsYXllcih2aWRlbywgaGFzQXVkaW8pO1xuXHRvdmVybG9hZEFQSSh2aWRlbyk7XG5cdHZpZGVvLmNsYXNzTGlzdC5hZGQoJ0lJVicpO1xuXHRpZiAoIWhhc0F1ZGlvICYmIHZpZGVvLmF1dG9wbGF5KSB7XG5cdFx0dmlkZW8ucGxheSgpO1xuXHR9XG5cdGlmIChuYXZpZ2F0b3IucGxhdGZvcm0gPT09ICdNYWNJbnRlbCcgfHwgbmF2aWdhdG9yLnBsYXRmb3JtID09PSAnV2luZG93cycpIHtcblx0XHRjb25zb2xlLndhcm4oJ2lwaG9uZS1pbmxpbmUtdmlkZW8gaXMgbm90IGd1YXJhbnRlZWQgdG8gd29yayBpbiBlbXVsYXRlZCBlbnZpcm9ubWVudHMnKTtcblx0fVxufVxuXG5lbmFibGVJbmxpbmVWaWRlby5pc1doaXRlbGlzdGVkID0gaXNXaGl0ZWxpc3RlZDtcblxubW9kdWxlLmV4cG9ydHMgPSBlbmFibGVJbmxpbmVWaWRlbzsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBpbmRleCA9IHR5cGVvZiBTeW1ib2wgPT09ICd1bmRlZmluZWQnID8gZnVuY3Rpb24gKGRlc2NyaXB0aW9uKSB7XG5cdHJldHVybiAnQCcgKyAoZGVzY3JpcHRpb24gfHwgJ0AnKSArIE1hdGgucmFuZG9tKCk7XG59IDogU3ltYm9sO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluZGV4OyIsIi8qKlxuICpcbiAqIChjKSBXZW5zaGVuZyBZYW4gPHlhbndzaEBnbWFpbC5jb20+XG4gKiBEYXRlOiAxMC8zMC8xNlxuICpcbiAqIEZvciB0aGUgZnVsbCBjb3B5cmlnaHQgYW5kIGxpY2Vuc2UgaW5mb3JtYXRpb24sIHBsZWFzZSB2aWV3IHRoZSBMSUNFTlNFXG4gKiBmaWxlIHRoYXQgd2FzIGRpc3RyaWJ1dGVkIHdpdGggdGhpcyBzb3VyY2UgY29kZS5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi4vbGliL0RldGVjdG9yJztcbmltcG9ydCBNb2JpbGVCdWZmZXJpbmcgZnJvbSAnLi4vbGliL01vYmlsZUJ1ZmZlcmluZyc7XG5cbmNvbnN0IEhBVkVfRU5PVUdIX0RBVEEgPSA0O1xuXG52YXIgQmFzZUNhbnZhcyA9IGZ1bmN0aW9uIChiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MgPSB7fSkge1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzID0gb3B0aW9ucztcbiAgICAgICAgICAgIC8vYmFzaWMgc2V0dGluZ3NcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSBwbGF5ZXIuZWwoKS5vZmZzZXRXaWR0aCwgdGhpcy5oZWlnaHQgPSBwbGF5ZXIuZWwoKS5vZmZzZXRIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmxvbiA9IG9wdGlvbnMuaW5pdExvbiwgdGhpcy5sYXQgPSBvcHRpb25zLmluaXRMYXQsIHRoaXMucGhpID0gMCwgdGhpcy50aGV0YSA9IDA7XG4gICAgICAgICAgICB0aGlzLnZpZGVvVHlwZSA9IG9wdGlvbnMudmlkZW9UeXBlO1xuICAgICAgICAgICAgdGhpcy5jbGlja1RvVG9nZ2xlID0gb3B0aW9ucy5jbGlja1RvVG9nZ2xlO1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgcmVuZGVyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hdXRvQ2xlYXIgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q2xlYXJDb2xvcigweDAwMDAwMCwgMSk7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIHRleHR1cmUsIG9uIGllIDExLCB3ZSBuZWVkIGFkZGl0aW9uYWwgaGVscGVyIGNhbnZhcyB0byBzb2x2ZSByZW5kZXJpbmcgaXNzdWUuXG4gICAgICAgICAgICB2YXIgdmlkZW8gPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgICAgICB0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUgPSBEZXRlY3Rvci5zdXBwb3J0VmlkZW9UZXh0dXJlKCk7XG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhlbHBlckNhbnZhcyA9IHBsYXllci5hZGRDaGlsZChcIkhlbHBlckNhbnZhc1wiLCB7XG4gICAgICAgICAgICAgICAgICAgIHZpZGVvOiB2aWRlbyxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHRoaXMud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogdGhpcy5oZWlnaHRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB2YXIgY29udGV4dCA9IHRoaXMuaGVscGVyQ2FudmFzLmVsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUoY29udGV4dCk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZSh2aWRlbyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZpZGVvLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcblxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5tYXhGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuXG4gICAgICAgICAgICB0aGlzLmVsXyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcbiAgICAgICAgICAgIHRoaXMuZWxfLmNsYXNzTGlzdC5hZGQoJ3Zqcy12aWRlby1jYW52YXMnKTtcblxuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IHRoaXMuZWxfO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHRoaXMuYXR0YWNoQ29udHJvbEV2ZW50cygpO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5vbihcInBsYXlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuYW5pbWF0ZSgpO1xuICAgICAgICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBhdHRhY2hDb250cm9sRXZlbnRzOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2Vtb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaG1vdmUnLCB0aGlzLmhhbmRsZU1vdXNlTW92ZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlZG93bicsIHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2hzdGFydCcsdGhpcy5oYW5kbGVNb3VzZURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXVwJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2hlbmQnLCB0aGlzLmhhbmRsZU1vdXNlVXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLnNjcm9sbGFibGUpe1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ21vdXNld2hlZWwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5vbignTW96TW91c2VQaXhlbFNjcm9sbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlZW50ZXInLCB0aGlzLmhhbmRsZU1vdXNlRW50ZXIuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWxlYXZlJywgdGhpcy5oYW5kbGVNb3VzZUxlYXNlLmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHRoaXMucGxheWVyKCkuZWwoKS5vZmZzZXRXaWR0aCwgdGhpcy5oZWlnaHQgPSB0aGlzLnBsYXllcigpLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlVXA6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICBpZih0aGlzLmNsaWNrVG9Ub2dnbGUpe1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC5jaGFuZ2VkVG91Y2hlcyAmJiBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlggPSBNYXRoLmFicyhjbGllbnRYIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclgpO1xuICAgICAgICAgICAgICAgIHZhciBkaWZmWSA9IE1hdGguYWJzKGNsaWVudFkgLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSk7XG4gICAgICAgICAgICAgICAgaWYoZGlmZlggPCAwLjEgJiYgZGlmZlkgPCAwLjEpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkucGF1c2VkKCkgPyB0aGlzLnBsYXllcigpLnBsYXkoKSA6IHRoaXMucGxheWVyKCkucGF1c2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZURvd246IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICBpZih0eXBlb2YgY2xpZW50WCA9PT0gXCJ1bmRlZmluZWRcIiB8fCBjbGllbnRZID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCA9IGNsaWVudFg7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSA9IGNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Mb24gPSB0aGlzLmxvbjtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxhdCA9IHRoaXMubGF0O1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTW92ZTogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LnRvdWNoZXMgJiYgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgaWYodHlwZW9mIGNsaWVudFggPT09IFwidW5kZWZpbmVkXCIgfHwgY2xpZW50WSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5jbGlja0FuZERyYWcpe1xuICAgICAgICAgICAgICAgIGlmKHRoaXMubW91c2VEb3duKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYIC0gY2xpZW50WCApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTG9uO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICggY2xpZW50WSAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZICkgKiAwLjIgKyB0aGlzLm9uUG9pbnRlckRvd25MYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHggPSBldmVudC5wYWdlWCAtIHRoaXMuZWxfLm9mZnNldExlZnQ7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBldmVudC5wYWdlWSAtIHRoaXMuZWxfLm9mZnNldFRvcDtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICh4IC8gdGhpcy53aWR0aCkgKiA0MzAgLSAyMjU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoeSAvIHRoaXMuaGVpZ2h0KSAqIC0xODAgKyA5MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb2JpbGVPcmllbnRhdGlvbjogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBpZih0eXBlb2YgZXZlbnQucm90YXRpb25SYXRlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnJvdGF0aW9uUmF0ZS5hbHBoYTtcbiAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucm90YXRpb25SYXRlLmJldGE7XG4gICAgICAgICAgICB2YXIgcG9ydHJhaXQgPSAodHlwZW9mIGV2ZW50LnBvcnRyYWl0ICE9PSBcInVuZGVmaW5lZFwiKT8gZXZlbnQucG9ydHJhaXQgOiB3aW5kb3cubWF0Y2hNZWRpYShcIihvcmllbnRhdGlvbjogcG9ydHJhaXQpXCIpLm1hdGNoZXM7XG4gICAgICAgICAgICB2YXIgbGFuZHNjYXBlID0gKHR5cGVvZiBldmVudC5sYW5kc2NhcGUgIT09IFwidW5kZWZpbmVkXCIpPyBldmVudC5sYW5kc2NhcGUgOiB3aW5kb3cubWF0Y2hNZWRpYShcIihvcmllbnRhdGlvbjogbGFuZHNjYXBlKVwiKS5tYXRjaGVzO1xuICAgICAgICAgICAgdmFyIG9yaWVudGF0aW9uID0gZXZlbnQub3JpZW50YXRpb24gfHwgd2luZG93Lm9yaWVudGF0aW9uO1xuXG4gICAgICAgICAgICBpZiAocG9ydHJhaXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IHRoaXMubG9uIC0geSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSB0aGlzLmxhdCArIHggKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgfWVsc2UgaWYobGFuZHNjYXBlKXtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50YXRpb25EZWdyZWUgPSAtOTA7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIG9yaWVudGF0aW9uICE9IFwidW5kZWZpbmVkXCIpe1xuICAgICAgICAgICAgICAgICAgICBvcmllbnRhdGlvbkRlZ3JlZSA9IG9yaWVudGF0aW9uO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKG9yaWVudGF0aW9uRGVncmVlID09IC05MCk/IHRoaXMubG9uICsgeCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWUgOiB0aGlzLmxvbiAtIHggKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKG9yaWVudGF0aW9uRGVncmVlID09IC05MCk/IHRoaXMubGF0ICsgeSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWUgOiB0aGlzLmxhdCAtIHkgKiB0aGlzLnNldHRpbmdzLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlV2hlZWw6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUVudGVyOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTGVhc2U6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFuaW1hdGU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RBbmltYXRpb25JZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSggdGhpcy5hbmltYXRlLmJpbmQodGhpcykgKTtcbiAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllcigpLnBhdXNlZCgpKXtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YodGhpcy50ZXh0dXJlKSAhPT0gXCJ1bmRlZmluZWRcIiAmJiAoIXRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIoKS5yZWFkeVN0YXRlKCkgPT09IEhBVkVfRU5PVUdIX0RBVEEgfHwgdGhpcy5pc1BsYXlPbk1vYmlsZSAmJiB0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBsYXlpbmdcIikpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3QgLSB0aGlzLnRpbWUgPj0gMzApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBjdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZih0aGlzLmlzUGxheU9uTW9iaWxlKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50VGltZSA9IHRoaXMucGxheWVyKCkuY3VycmVudFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKE1vYmlsZUJ1ZmZlcmluZy5pc0J1ZmZlcmluZyhjdXJyZW50VGltZSkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZih0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5yZW1vdmVDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGlmKCF0aGlzLmlzVXNlckludGVyYWN0aW5nKXtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTGF0ID0gKHRoaXMubGF0ID4gdGhpcy5zZXR0aW5ncy5pbml0TGF0KT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTG9uID0gKHRoaXMubG9uID4gdGhpcy5zZXR0aW5ncy5pbml0TG9uKT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmJhY2tUb1ZlcnRpY2FsQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA+ICh0aGlzLnNldHRpbmdzLmluaXRMYXQgLSBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQpKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPCAodGhpcy5zZXR0aW5ncy5pbml0TGF0ICsgTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0KSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5zZXR0aW5ncy5pbml0TGF0IDogdGhpcy5sYXQgKyB0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQgKiBzeW1ib2xMYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYmFja1RvSG9yaXpvbkNlbnRlcil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPiAodGhpcy5zZXR0aW5ncy5pbml0TG9uIC0gTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uKSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9uIDwgKHRoaXMuc2V0dGluZ3MuaW5pdExvbiArIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbikpXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMuc2V0dGluZ3MuaW5pdExvbiA6IHRoaXMubG9uICsgdGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uICogc3ltYm9sTG9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMubGF0ID0gTWF0aC5tYXgoIHRoaXMuc2V0dGluZ3MubWluTGF0LCBNYXRoLm1pbiggdGhpcy5zZXR0aW5ncy5tYXhMYXQsIHRoaXMubGF0ICkgKTtcbiAgICAgICAgICAgIHRoaXMubG9uID0gTWF0aC5tYXgoIHRoaXMuc2V0dGluZ3MubWluTG9uLCBNYXRoLm1pbiggdGhpcy5zZXR0aW5ncy5tYXhMb24sIHRoaXMubG9uICkgKTtcbiAgICAgICAgICAgIHRoaXMucGhpID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggOTAgLSB0aGlzLmxhdCApO1xuICAgICAgICAgICAgdGhpcy50aGV0YSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIHRoaXMubG9uICk7XG5cbiAgICAgICAgICAgIGlmKCF0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUpe1xuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzLnVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5jbGVhcigpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHBsYXlPbk1vYmlsZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pc1BsYXlPbk1vYmlsZSA9IHRydWU7XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmF1dG9Nb2JpbGVPcmllbnRhdGlvbilcbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZGV2aWNlbW90aW9uJywgdGhpcy5oYW5kbGVNb2JpbGVPcmllbnRhdGlvbi5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmVsXztcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IEJhc2VDYW52YXM7XG4iLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuXG5pbXBvcnQgQmFzZUNhbnZhcyBmcm9tICcuL0Jhc2VDYW52YXMnO1xuaW1wb3J0IFV0aWwgZnJvbSAnLi9VdGlsJztcblxudmFyIENhbnZhcyA9IGZ1bmN0aW9uIChiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MgPSB7fSkge1xuICAgIHZhciBwYXJlbnQgPSBCYXNlQ2FudmFzKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyk7XG5cbiAgICByZXR1cm4gVXRpbC5leHRlbmQocGFyZW50LCB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBwYXJlbnQuY29uc3RydWN0b3IuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgLy9kZWZpbmUgc2NlbmVcbiAgICAgICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEob3B0aW9ucy5pbml0Rm92LCB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDAsIDAsIDAgKTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgZ2VvbWV0cnlcbiAgICAgICAgICAgIHZhciBnZW9tZXRyeSA9ICh0aGlzLnZpZGVvVHlwZSA9PT0gXCJlcXVpcmVjdGFuZ3VsYXJcIik/IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSg1MDAsIDYwLCA0MCk6IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSggNTAwLCA2MCwgNDAgKS50b05vbkluZGV4ZWQoKTtcbiAgICAgICAgICAgIGlmKHRoaXMudmlkZW9UeXBlID09PSBcImZpc2hleWVcIil7XG4gICAgICAgICAgICAgICAgdmFyIG5vcm1hbHMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgICAgICB2YXIgdXZzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDAsIGwgPSBub3JtYWxzLmxlbmd0aCAvIDM7IGkgPCBsOyBpICsrICkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IG5vcm1hbHNbIGkgKiAzICsgMCBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeSA9IG5vcm1hbHNbIGkgKiAzICsgMSBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeiA9IG5vcm1hbHNbIGkgKiAzICsgMiBdO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciByID0gTWF0aC5hc2luKE1hdGguc3FydCh4ICogeCArIHogKiB6KSAvIE1hdGguc3FydCh4ICogeCAgKyB5ICogeSArIHogKiB6KSkgLyBNYXRoLlBJO1xuICAgICAgICAgICAgICAgICAgICBpZih5IDwgMCkgciA9IDEgLSByO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGhldGEgPSAoeCA9PSAwICYmIHogPT0gMCk/IDAgOiBNYXRoLmFjb3MoeCAvIE1hdGguc3FydCh4ICogeCArIHogKiB6KSk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHogPCAwKSB0aGV0YSA9IHRoZXRhICogLTE7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAwIF0gPSAtMC44ICogciAqIE1hdGguY29zKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDEgXSA9IDAuOCAqIHIgKiBNYXRoLnNpbih0aGV0YSkgKyAwLjU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVgoIG9wdGlvbnMucm90YXRlWCk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWSggb3B0aW9ucy5yb3RhdGVZKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVaKCBvcHRpb25zLnJvdGF0ZVopO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ2VvbWV0cnkuc2NhbGUoIC0gMSwgMSwgMSApO1xuICAgICAgICAgICAgLy9kZWZpbmUgbWVzaFxuICAgICAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0aGlzLnRleHR1cmV9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vdGhpcy5tZXNoLnNjYWxlLnggPSAtMTtcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMubWVzaCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZW5hYmxlVlI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuVlJNb2RlID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmKHR5cGVvZiB2ckhNRCAhPT0gJ3VuZGVmaW5lZCcpe1xuICAgICAgICAgICAgICAgIHZhciBleWVQYXJhbXNMID0gdnJITUQuZ2V0RXllUGFyYW1ldGVycyggJ2xlZnQnICk7XG4gICAgICAgICAgICAgICAgdmFyIGV5ZVBhcmFtc1IgPSB2ckhNRC5nZXRFeWVQYXJhbWV0ZXJzKCAncmlnaHQnICk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmV5ZUZPVkwgPSBleWVQYXJhbXNMLnJlY29tbWVuZGVkRmllbGRPZlZpZXc7XG4gICAgICAgICAgICAgICAgdGhpcy5leWVGT1ZSID0gZXllUGFyYW1zUi5yZWNvbW1lbmRlZEZpZWxkT2ZWaWV3O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEodGhpcy5jYW1lcmEuZm92LCB0aGlzLndpZHRoIC8yIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKHRoaXMuY2FtZXJhLmZvdiwgdGhpcy53aWR0aCAvMiAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgfSxcblxuICAgICAgICBkaXNhYmxlVlI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuVlJNb2RlID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZVJlc2l6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZVJlc2l6ZS5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgaWYodGhpcy5WUk1vZGUpe1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5hc3BlY3QgPSB0aGlzLmNhbWVyYS5hc3BlY3QgLyAyO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5hc3BlY3QgPSB0aGlzLmNhbWVyYS5hc3BlY3QgLyAyO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBwYXJlbnQuaGFuZGxlTW91c2VXaGVlbChldmVudCk7XG4gICAgICAgICAgICAvLyBXZWJLaXRcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92IC09IGV2ZW50LndoZWVsRGVsdGFZICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBPcGVyYSAvIEV4cGxvcmVyIDlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LndoZWVsRGVsdGEgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92IC09IGV2ZW50LndoZWVsRGVsdGEgKiAwLjA1O1xuICAgICAgICAgICAgICAgIC8vIEZpcmVmb3hcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LmRldGFpbCApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgKz0gZXZlbnQuZGV0YWlsICogMS4wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5taW4odGhpcy5zZXR0aW5ncy5tYXhGb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgPSBNYXRoLm1heCh0aGlzLnNldHRpbmdzLm1pbkZvdiwgdGhpcy5jYW1lcmEuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIGlmKHRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuZm92ID0gdGhpcy5jYW1lcmEuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5mb3YgPSB0aGlzLmNhbWVyYS5mb3Y7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHBhcmVudC5yZW5kZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEubG9va0F0KCB0aGlzLmNhbWVyYS50YXJnZXQgKTtcblxuICAgICAgICAgICAgaWYoIXRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHZpZXdQb3J0V2lkdGggPSB0aGlzLndpZHRoIC8gMiwgdmlld1BvcnRIZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YgdnJITUQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZMLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZSLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxvbkwgPSB0aGlzLmxvbiArIHRoaXMuc2V0dGluZ3MuVlJHYXBEZWdyZWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb25SID0gdGhpcy5sb24gLSB0aGlzLnNldHRpbmdzLlZSR2FwRGVncmVlO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YUwgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25MICk7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YVIgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25SICk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldEwgPSBVdGlsLmRlZXBDb3B5KHRoaXMuY2FtZXJhLnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldEwueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoZXRhTCApO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMLnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGV0YUwgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmxvb2tBdCh0YXJnZXRMKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgdGFyZ2V0UiA9IFV0aWwuZGVlcENvcHkodGhpcy5jYW1lcmEudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ui54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhldGFSICk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFIueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoZXRhUiApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIubG9va0F0KHRhcmdldFIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyByZW5kZXIgbGVmdCBleWVcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3NvciggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmFMICk7XG5cbiAgICAgICAgICAgICAgICAvLyByZW5kZXIgcmlnaHQgZXllXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggdmlld1BvcnRXaWR0aCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhUiApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBDYW52YXM7XG4iLCIvKipcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXG4gKiBAYXV0aG9yIG1yLmRvb2IgLyBodHRwOi8vbXJkb29iLmNvbS9cbiAqL1xuXG52YXIgRGV0ZWN0b3IgPSB7XG5cbiAgICBjYW52YXM6ICEhIHdpbmRvdy5DYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gICAgd2ViZ2w6ICggZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHRyeSB7XG5cbiAgICAgICAgICAgIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnY2FudmFzJyApOyByZXR1cm4gISEgKCB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0ICYmICggY2FudmFzLmdldENvbnRleHQoICd3ZWJnbCcgKSB8fCBjYW52YXMuZ2V0Q29udGV4dCggJ2V4cGVyaW1lbnRhbC13ZWJnbCcgKSApICk7XG5cbiAgICAgICAgfSBjYXRjaCAoIGUgKSB7XG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICB9XG5cbiAgICB9ICkoKSxcbiAgICB3b3JrZXJzOiAhISB3aW5kb3cuV29ya2VyLFxuICAgIGZpbGVhcGk6IHdpbmRvdy5GaWxlICYmIHdpbmRvdy5GaWxlUmVhZGVyICYmIHdpbmRvdy5GaWxlTGlzdCAmJiB3aW5kb3cuQmxvYixcblxuICAgICBDaGVja19WZXJzaW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgIHZhciBydiA9IC0xOyAvLyBSZXR1cm4gdmFsdWUgYXNzdW1lcyBmYWlsdXJlLlxuXG4gICAgICAgICBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gJ01pY3Jvc29mdCBJbnRlcm5ldCBFeHBsb3JlcicpIHtcblxuICAgICAgICAgICAgIHZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQsXG4gICAgICAgICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChcIk1TSUUgKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcblxuICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICBydiA9IHBhcnNlRmxvYXQoUmVnRXhwLiQxKTtcbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICAgICBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSBcIk5ldHNjYXBlXCIpIHtcbiAgICAgICAgICAgICAvLy8gaW4gSUUgMTEgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIHNheXMgJ3RyaWRlbnQnXG4gICAgICAgICAgICAgLy8vIGluIEVkZ2UgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIGRvZXMgbm90IHNheSB0cmlkZW50XG4gICAgICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1RyaWRlbnQnKSAhPT0gLTEpIHJ2ID0gMTE7XG4gICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudDtcbiAgICAgICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cChcIkVkZ2VcXC8oWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuICAgICAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgfVxuXG4gICAgICAgICByZXR1cm4gcnY7XG4gICAgIH0sXG5cbiAgICBzdXBwb3J0VmlkZW9UZXh0dXJlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vaWUgMTEgYW5kIGVkZ2UgMTIgZG9lc24ndCBzdXBwb3J0IHZpZGVvIHRleHR1cmUuXG4gICAgICAgIHZhciB2ZXJzaW9uID0gdGhpcy5DaGVja19WZXJzaW9uKCk7XG4gICAgICAgIHJldHVybiAodmVyc2lvbiA9PT0gLTEgfHwgdmVyc2lvbiA+PSAxMyk7XG4gICAgfSxcblxuICAgIGdldFdlYkdMRXJyb3JNZXNzYWdlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgICAgICBlbGVtZW50LmlkID0gJ3dlYmdsLWVycm9yLW1lc3NhZ2UnO1xuXG4gICAgICAgIGlmICggISB0aGlzLndlYmdsICkge1xuXG4gICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgPyBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgZ3JhcGhpY3MgY2FyZCBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIgLz4nLFxuICAgICAgICAgICAgICAgICdGaW5kIG91dCBob3cgdG8gZ2V0IGl0IDxhIGhyZWY9XCJodHRwOi8vZ2V0LndlYmdsLm9yZy9cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5oZXJlPC9hPi4nXG4gICAgICAgICAgICBdLmpvaW4oICdcXG4nICkgOiBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgYnJvd3NlciBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG5cbiAgICB9LFxuXG4gICAgYWRkR2V0V2ViR0xNZXNzYWdlOiBmdW5jdGlvbiAoIHBhcmFtZXRlcnMgKSB7XG5cbiAgICAgICAgdmFyIHBhcmVudCwgaWQsIGVsZW1lbnQ7XG5cbiAgICAgICAgcGFyYW1ldGVycyA9IHBhcmFtZXRlcnMgfHwge307XG5cbiAgICAgICAgcGFyZW50ID0gcGFyYW1ldGVycy5wYXJlbnQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMucGFyZW50IDogZG9jdW1lbnQuYm9keTtcbiAgICAgICAgaWQgPSBwYXJhbWV0ZXJzLmlkICE9PSB1bmRlZmluZWQgPyBwYXJhbWV0ZXJzLmlkIDogJ29sZGllJztcblxuICAgICAgICBlbGVtZW50ID0gRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKTtcbiAgICAgICAgZWxlbWVudC5pZCA9IGlkO1xuXG4gICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCggZWxlbWVudCApO1xuXG4gICAgfVxuXG59O1xuXG5leHBvcnQgZGVmYXVsdCBEZXRlY3RvcjsiLCIvKipcbiAqIENyZWF0ZWQgYnkgd2Vuc2hlbmcueWFuIG9uIDUvMjMvMTYuXG4gKi9cbnZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5lbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLWhlbHBlci1jYW52YXNcIjtcblxudmFyIEhlbHBlckNhbnZhcyA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICB0aGlzLnZpZGVvRWxlbWVudCA9IG9wdGlvbnMudmlkZW87XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gb3B0aW9ucy53aWR0aDtcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XG5cbiAgICAgICAgICAgIGVsZW1lbnQud2lkdGggPSB0aGlzLndpZHRoO1xuICAgICAgICAgICAgZWxlbWVudC5oZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG5cblxuICAgICAgICAgICAgdGhpcy5jb250ZXh0ID0gZWxlbWVudC5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBnZXRDb250ZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dDsgIFxuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgSGVscGVyQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNi82LzE2LlxuICovXG52YXIgTW9iaWxlQnVmZmVyaW5nID0ge1xuICAgIHByZXZfY3VycmVudFRpbWU6IDAsXG4gICAgY291bnRlcjogMCxcbiAgICBcbiAgICBpc0J1ZmZlcmluZzogZnVuY3Rpb24gKGN1cnJlbnRUaW1lKSB7XG4gICAgICAgIGlmIChjdXJyZW50VGltZSA9PSB0aGlzLnByZXZfY3VycmVudFRpbWUpIHRoaXMuY291bnRlcisrO1xuICAgICAgICBlbHNlIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucHJldl9jdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICBpZih0aGlzLmNvdW50ZXIgPiAxMCl7XG4gICAgICAgICAgICAvL25vdCBsZXQgY291bnRlciBvdmVyZmxvd1xuICAgICAgICAgICAgdGhpcy5jb3VudGVyID0gMTA7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgTW9iaWxlQnVmZmVyaW5nOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC80LzE2LlxuICovXG5cbnZhciBOb3RpY2UgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcbiAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVsZW1lbnQuY2xhc3NOYW1lID0gXCJ2anMtdmlkZW8tbm90aWNlLWxhYmVsXCI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgaWYodHlwZW9mIG9wdGlvbnMuTm90aWNlTWVzc2FnZSA9PSBcIm9iamVjdFwiKXtcbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICB9ZWxzZSBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwic3RyaW5nXCIpe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBlbGVtZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBOb3RpY2U7IiwiLyoqXG4gKlxuICogKGMpIFdlbnNoZW5nIFlhbiA8eWFud3NoQGdtYWlsLmNvbT5cbiAqIERhdGU6IDEwLzIxLzE2XG4gKlxuICogRm9yIHRoZSBmdWxsIGNvcHlyaWdodCBhbmQgbGljZW5zZSBpbmZvcm1hdGlvbiwgcGxlYXNlIHZpZXcgdGhlIExJQ0VOU0VcbiAqIGZpbGUgdGhhdCB3YXMgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzIHNvdXJjZSBjb2RlLlxuICovXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCBCYXNlQ2FudmFzIGZyb20gJy4vQmFzZUNhbnZhcyc7XG5pbXBvcnQgVXRpbCBmcm9tICcuL1V0aWwnO1xuXG52YXIgVGhyZWVEQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KXtcbiAgICB2YXIgcGFyZW50ID0gQmFzZUNhbnZhcyhiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MpO1xuICAgIHJldHVybiBVdGlsLmV4dGVuZChwYXJlbnQsIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHBhcmVudC5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIHNjZW5lXG4gICAgICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG4gICAgICAgICAgICB2YXIgYXNwZWN0UmF0aW8gPSB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQgLyAyO1xuICAgICAgICAgICAgLy9kZWZpbmUgY2FtZXJhXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEob3B0aW9ucy5pbml0Rm92LCBhc3BlY3RSYXRpbywgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDAsIDAsIDAgKTtcblxuICAgICAgICAgICAgdGhpcy5jYW1lcmFSID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgYXNwZWN0UmF0aW8sIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnBvc2l0aW9uLnNldCggMTAwMCwgMCwgMCApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAxMDAwLCAwLCAwICk7XG5cbiAgICAgICAgICAgIHZhciBnZW9tZXRyeUwgPSBuZXcgVEhSRUUuU3BoZXJlQnVmZmVyR2VvbWV0cnkoNTAwLCA2MCwgNDApLnRvTm9uSW5kZXhlZCgpO1xuICAgICAgICAgICAgdmFyIGdlb21ldHJ5UiA9IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSg1MDAsIDYwLCA0MCkudG9Ob25JbmRleGVkKCk7XG5cbiAgICAgICAgICAgIHZhciB1dnNMID0gZ2VvbWV0cnlMLmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICB2YXIgbm9ybWFsc0wgPSBnZW9tZXRyeUwuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBub3JtYWxzTC5sZW5ndGggLyAzOyBpICsrICkge1xuICAgICAgICAgICAgICAgIHV2c0xbIGkgKiAyICsgMSBdID0gdXZzTFsgaSAqIDIgKyAxIF0gLyAyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdXZzUiA9IGdlb21ldHJ5Ui5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgdmFyIG5vcm1hbHNSID0gZ2VvbWV0cnlSLmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgZm9yICggdmFyIGkgPSAwOyBpIDwgbm9ybWFsc1IubGVuZ3RoIC8gMzsgaSArKyApIHtcbiAgICAgICAgICAgICAgICB1dnNSWyBpICogMiArIDEgXSA9IHV2c1JbIGkgKiAyICsgMSBdIC8gMiArIDAuNTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZ2VvbWV0cnlMLnNjYWxlKCAtIDEsIDEsIDEgKTtcbiAgICAgICAgICAgIGdlb21ldHJ5Ui5zY2FsZSggLSAxLCAxLCAxICk7XG5cbiAgICAgICAgICAgIHRoaXMubWVzaEwgPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeUwsXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0aGlzLnRleHR1cmV9KVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgdGhpcy5tZXNoUiA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5UixcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhpcy5tZXNoUi5wb3NpdGlvbi5zZXQoMTAwMCwgMCwgMCk7XG5cbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMubWVzaEwpO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoUik7XG5cbiAgICAgICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVSZXNpemUuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHZhciBhc3BlY3RSYXRpbyA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodCAvIDI7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gYXNwZWN0UmF0aW87XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIuYXNwZWN0ID0gYXNwZWN0UmF0aW87XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZVdoZWVsOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBwYXJlbnQuaGFuZGxlTW91c2VXaGVlbChldmVudCk7XG4gICAgICAgICAgICAvLyBXZWJLaXRcbiAgICAgICAgICAgIGlmICggZXZlbnQud2hlZWxEZWx0YVkgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gRmlyZWZveFxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQuZGV0YWlsICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgKz0gZXZlbnQuZGV0YWlsICogMS4wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYUwuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgPSBNYXRoLm1heCh0aGlzLnNldHRpbmdzLm1pbkZvdiwgdGhpcy5jYW1lcmFMLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIuZm92ID0gdGhpcy5jYW1lcmFMLmZvdjtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHBhcmVudC5yZW5kZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHZhciB2aWV3UG9ydFdpZHRoID0gdGhpcy53aWR0aCAvIDIsIHZpZXdQb3J0SGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0LnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5sb29rQXQodGhpcy5jYW1lcmFMLnRhcmdldCk7XG5cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi50YXJnZXQueCA9IDEwMDAgKyA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0LnkgPSA1MDAgKiBNYXRoLmNvcyggdGhpcy5waGkgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5sb29rQXQoIHRoaXMuY2FtZXJhUi50YXJnZXQgKTtcblxuICAgICAgICAgICAgLy8gcmVuZGVyIGxlZnQgZXllXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhTCApO1xuXG4gICAgICAgICAgICAvLyByZW5kZXIgcmlnaHQgZXllXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhUiApO1xuICAgICAgICB9XG4gICAgfSk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBUaHJlZURDYW52YXM7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA0LzQvMTYuXG4gKi9cbmZ1bmN0aW9uIHdoaWNoVHJhbnNpdGlvbkV2ZW50KCl7XG4gICAgdmFyIHQ7XG4gICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZmFrZWVsZW1lbnQnKTtcbiAgICB2YXIgdHJhbnNpdGlvbnMgPSB7XG4gICAgICAgICd0cmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdPVHJhbnNpdGlvbic6J29UcmFuc2l0aW9uRW5kJyxcbiAgICAgICAgJ01velRyYW5zaXRpb24nOid0cmFuc2l0aW9uZW5kJyxcbiAgICAgICAgJ1dlYmtpdFRyYW5zaXRpb24nOid3ZWJraXRUcmFuc2l0aW9uRW5kJ1xuICAgIH07XG5cbiAgICBmb3IodCBpbiB0cmFuc2l0aW9ucyl7XG4gICAgICAgIGlmKCBlbC5zdHlsZVt0XSAhPT0gdW5kZWZpbmVkICl7XG4gICAgICAgICAgICByZXR1cm4gdHJhbnNpdGlvbnNbdF07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1vYmlsZUFuZFRhYmxldGNoZWNrKCkge1xuICAgIHZhciBjaGVjayA9IGZhbHNlO1xuICAgIChmdW5jdGlvbihhKXtpZigvKGFuZHJvaWR8YmJcXGQrfG1lZWdvKS4rbW9iaWxlfGF2YW50Z298YmFkYVxcL3xibGFja2JlcnJ5fGJsYXplcnxjb21wYWx8ZWxhaW5lfGZlbm5lY3xoaXB0b3B8aWVtb2JpbGV8aXAoaG9uZXxvZCl8aXJpc3xraW5kbGV8bGdlIHxtYWVtb3xtaWRwfG1tcHxtb2JpbGUuK2ZpcmVmb3h8bmV0ZnJvbnR8b3BlcmEgbShvYnxpbilpfHBhbG0oIG9zKT98cGhvbmV8cChpeGl8cmUpXFwvfHBsdWNrZXJ8cG9ja2V0fHBzcHxzZXJpZXMoNHw2KTB8c3ltYmlhbnx0cmVvfHVwXFwuKGJyb3dzZXJ8bGluayl8dm9kYWZvbmV8d2FwfHdpbmRvd3MgY2V8eGRhfHhpaW5vfGFuZHJvaWR8aXBhZHxwbGF5Ym9va3xzaWxrL2kudGVzdChhKXx8LzEyMDd8NjMxMHw2NTkwfDNnc298NHRocHw1MFsxLTZdaXw3NzBzfDgwMnN8YSB3YXxhYmFjfGFjKGVyfG9vfHNcXC0pfGFpKGtvfHJuKXxhbChhdnxjYXxjbyl8YW1vaXxhbihleHxueXx5dyl8YXB0dXxhcihjaHxnbyl8YXModGV8dXMpfGF0dHd8YXUoZGl8XFwtbXxyIHxzICl8YXZhbnxiZShja3xsbHxucSl8YmkobGJ8cmQpfGJsKGFjfGF6KXxicihlfHYpd3xidW1ifGJ3XFwtKG58dSl8YzU1XFwvfGNhcGl8Y2N3YXxjZG1cXC18Y2VsbHxjaHRtfGNsZGN8Y21kXFwtfGNvKG1wfG5kKXxjcmF3fGRhKGl0fGxsfG5nKXxkYnRlfGRjXFwtc3xkZXZpfGRpY2F8ZG1vYnxkbyhjfHApb3xkcygxMnxcXC1kKXxlbCg0OXxhaSl8ZW0obDJ8dWwpfGVyKGljfGswKXxlc2w4fGV6KFs0LTddMHxvc3x3YXx6ZSl8ZmV0Y3xmbHkoXFwtfF8pfGcxIHV8ZzU2MHxnZW5lfGdmXFwtNXxnXFwtbW98Z28oXFwud3xvZCl8Z3IoYWR8dW4pfGhhaWV8aGNpdHxoZFxcLShtfHB8dCl8aGVpXFwtfGhpKHB0fHRhKXxocCggaXxpcCl8aHNcXC1jfGh0KGMoXFwtfCB8X3xhfGd8cHxzfHQpfHRwKXxodShhd3x0Yyl8aVxcLSgyMHxnb3xtYSl8aTIzMHxpYWMoIHxcXC18XFwvKXxpYnJvfGlkZWF8aWcwMXxpa29tfGltMWt8aW5ub3xpcGFxfGlyaXN8amEodHx2KWF8amJyb3xqZW11fGppZ3N8a2RkaXxrZWppfGtndCggfFxcLyl8a2xvbnxrcHQgfGt3Y1xcLXxreW8oY3xrKXxsZShub3x4aSl8bGcoIGd8XFwvKGt8bHx1KXw1MHw1NHxcXC1bYS13XSl8bGlid3xseW54fG0xXFwtd3xtM2dhfG01MFxcL3xtYSh0ZXx1aXx4byl8bWMoMDF8MjF8Y2EpfG1cXC1jcnxtZShyY3xyaSl8bWkobzh8b2F8dHMpfG1tZWZ8bW8oMDF8MDJ8Yml8ZGV8ZG98dChcXC18IHxvfHYpfHp6KXxtdCg1MHxwMXx2ICl8bXdicHxteXdhfG4xMFswLTJdfG4yMFsyLTNdfG4zMCgwfDIpfG41MCgwfDJ8NSl8bjcoMCgwfDEpfDEwKXxuZSgoY3xtKVxcLXxvbnx0Znx3Znx3Z3x3dCl8bm9rKDZ8aSl8bnpwaHxvMmltfG9wKHRpfHd2KXxvcmFufG93ZzF8cDgwMHxwYW4oYXxkfHQpfHBkeGd8cGcoMTN8XFwtKFsxLThdfGMpKXxwaGlsfHBpcmV8cGwoYXl8dWMpfHBuXFwtMnxwbyhja3xydHxzZSl8cHJveHxwc2lvfHB0XFwtZ3xxYVxcLWF8cWMoMDd8MTJ8MjF8MzJ8NjB8XFwtWzItN118aVxcLSl8cXRla3xyMzgwfHI2MDB8cmFrc3xyaW05fHJvKHZlfHpvKXxzNTVcXC98c2EoZ2V8bWF8bW18bXN8bnl8dmEpfHNjKDAxfGhcXC18b298cFxcLSl8c2RrXFwvfHNlKGMoXFwtfDB8MSl8NDd8bWN8bmR8cmkpfHNnaFxcLXxzaGFyfHNpZShcXC18bSl8c2tcXC0wfHNsKDQ1fGlkKXxzbShhbHxhcnxiM3xpdHx0NSl8c28oZnR8bnkpfHNwKDAxfGhcXC18dlxcLXx2ICl8c3koMDF8bWIpfHQyKDE4fDUwKXx0NigwMHwxMHwxOCl8dGEoZ3R8bGspfHRjbFxcLXx0ZGdcXC18dGVsKGl8bSl8dGltXFwtfHRcXC1tb3x0byhwbHxzaCl8dHMoNzB8bVxcLXxtM3xtNSl8dHhcXC05fHVwKFxcLmJ8ZzF8c2kpfHV0c3R8djQwMHx2NzUwfHZlcml8dmkocmd8dGUpfHZrKDQwfDVbMC0zXXxcXC12KXx2bTQwfHZvZGF8dnVsY3x2eCg1Mnw1M3w2MHw2MXw3MHw4MHw4MXw4M3w4NXw5OCl8dzNjKFxcLXwgKXx3ZWJjfHdoaXR8d2koZyB8bmN8bncpfHdtbGJ8d29udXx4NzAwfHlhc1xcLXx5b3VyfHpldG98enRlXFwtL2kudGVzdChhLnN1YnN0cigwLDQpKSljaGVjayA9IHRydWV9KShuYXZpZ2F0b3IudXNlckFnZW50fHxuYXZpZ2F0b3IudmVuZG9yfHx3aW5kb3cub3BlcmEpO1xuICAgIHJldHVybiBjaGVjaztcbn1cblxuZnVuY3Rpb24gaXNJb3MoKSB7XG4gICAgcmV0dXJuIC9pUGhvbmV8aVBhZHxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcbn1cblxuZnVuY3Rpb24gaXNSZWFsSXBob25lKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQb2QvaS50ZXN0KG5hdmlnYXRvci5wbGF0Zm9ybSk7XG59XG5cbi8vYWRvcHQgY29kZSBmcm9tOiBodHRwczovL2dpdGh1Yi5jb20vTW96VlIvdnItd2ViLWV4YW1wbGVzL2Jsb2IvbWFzdGVyL3RocmVlanMtdnItYm9pbGVycGxhdGUvanMvVlJFZmZlY3QuanNcbmZ1bmN0aW9uIGZvdlRvTkRDU2NhbGVPZmZzZXQoIGZvdiApIHtcbiAgICB2YXIgcHhzY2FsZSA9IDIuMCAvIChmb3YubGVmdFRhbiArIGZvdi5yaWdodFRhbik7XG4gICAgdmFyIHB4b2Zmc2V0ID0gKGZvdi5sZWZ0VGFuIC0gZm92LnJpZ2h0VGFuKSAqIHB4c2NhbGUgKiAwLjU7XG4gICAgdmFyIHB5c2NhbGUgPSAyLjAgLyAoZm92LnVwVGFuICsgZm92LmRvd25UYW4pO1xuICAgIHZhciBweW9mZnNldCA9IChmb3YudXBUYW4gLSBmb3YuZG93blRhbikgKiBweXNjYWxlICogMC41O1xuICAgIHJldHVybiB7IHNjYWxlOiBbIHB4c2NhbGUsIHB5c2NhbGUgXSwgb2Zmc2V0OiBbIHB4b2Zmc2V0LCBweW9mZnNldCBdIH07XG59XG5cbmZ1bmN0aW9uIGZvdlBvcnRUb1Byb2plY3Rpb24oIGZvdiwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICkge1xuXG4gICAgcmlnaHRIYW5kZWQgPSByaWdodEhhbmRlZCA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IHJpZ2h0SGFuZGVkO1xuICAgIHpOZWFyID0gek5lYXIgPT09IHVuZGVmaW5lZCA/IDAuMDEgOiB6TmVhcjtcbiAgICB6RmFyID0gekZhciA9PT0gdW5kZWZpbmVkID8gMTAwMDAuMCA6IHpGYXI7XG5cbiAgICB2YXIgaGFuZGVkbmVzc1NjYWxlID0gcmlnaHRIYW5kZWQgPyAtMS4wIDogMS4wO1xuXG4gICAgLy8gc3RhcnQgd2l0aCBhbiBpZGVudGl0eSBtYXRyaXhcbiAgICB2YXIgbW9iaiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gICAgdmFyIG0gPSBtb2JqLmVsZW1lbnRzO1xuXG4gICAgLy8gYW5kIHdpdGggc2NhbGUvb2Zmc2V0IGluZm8gZm9yIG5vcm1hbGl6ZWQgZGV2aWNlIGNvb3Jkc1xuICAgIHZhciBzY2FsZUFuZE9mZnNldCA9IGZvdlRvTkRDU2NhbGVPZmZzZXQoZm92KTtcblxuICAgIC8vIFggcmVzdWx0LCBtYXAgY2xpcCBlZGdlcyB0byBbLXcsK3ddXG4gICAgbVswICogNCArIDBdID0gc2NhbGVBbmRPZmZzZXQuc2NhbGVbMF07XG4gICAgbVswICogNCArIDFdID0gMC4wO1xuICAgIG1bMCAqIDQgKyAyXSA9IHNjYWxlQW5kT2Zmc2V0Lm9mZnNldFswXSAqIGhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzAgKiA0ICsgM10gPSAwLjA7XG5cbiAgICAvLyBZIHJlc3VsdCwgbWFwIGNsaXAgZWRnZXMgdG8gWy13LCt3XVxuICAgIC8vIFkgb2Zmc2V0IGlzIG5lZ2F0ZWQgYmVjYXVzZSB0aGlzIHByb2ogbWF0cml4IHRyYW5zZm9ybXMgZnJvbSB3b3JsZCBjb29yZHMgd2l0aCBZPXVwLFxuICAgIC8vIGJ1dCB0aGUgTkRDIHNjYWxpbmcgaGFzIFk9ZG93biAodGhhbmtzIEQzRD8pXG4gICAgbVsxICogNCArIDBdID0gMC4wO1xuICAgIG1bMSAqIDQgKyAxXSA9IHNjYWxlQW5kT2Zmc2V0LnNjYWxlWzFdO1xuICAgIG1bMSAqIDQgKyAyXSA9IC1zY2FsZUFuZE9mZnNldC5vZmZzZXRbMV0gKiBoYW5kZWRuZXNzU2NhbGU7XG4gICAgbVsxICogNCArIDNdID0gMC4wO1xuXG4gICAgLy8gWiByZXN1bHQgKHVwIHRvIHRoZSBhcHApXG4gICAgbVsyICogNCArIDBdID0gMC4wO1xuICAgIG1bMiAqIDQgKyAxXSA9IDAuMDtcbiAgICBtWzIgKiA0ICsgMl0gPSB6RmFyIC8gKHpOZWFyIC0gekZhcikgKiAtaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMiAqIDQgKyAzXSA9ICh6RmFyICogek5lYXIpIC8gKHpOZWFyIC0gekZhcik7XG5cbiAgICAvLyBXIHJlc3VsdCAoPSBaIGluKVxuICAgIG1bMyAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzMgKiA0ICsgMV0gPSAwLjA7XG4gICAgbVszICogNCArIDJdID0gaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMyAqIDQgKyAzXSA9IDAuMDtcblxuICAgIG1vYmoudHJhbnNwb3NlKCk7XG5cbiAgICByZXR1cm4gbW9iajtcbn1cblxuZnVuY3Rpb24gZm92VG9Qcm9qZWN0aW9uKCBmb3YsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApIHtcbiAgICB2YXIgREVHMlJBRCA9IE1hdGguUEkgLyAxODAuMDtcblxuICAgIHZhciBmb3ZQb3J0ID0ge1xuICAgICAgICB1cFRhbjogTWF0aC50YW4oIGZvdi51cERlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIGRvd25UYW46IE1hdGgudGFuKCBmb3YuZG93bkRlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIGxlZnRUYW46IE1hdGgudGFuKCBmb3YubGVmdERlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIHJpZ2h0VGFuOiBNYXRoLnRhbiggZm92LnJpZ2h0RGVncmVlcyAqIERFRzJSQUQgKVxuICAgIH07XG5cbiAgICByZXR1cm4gZm92UG9ydFRvUHJvamVjdGlvbiggZm92UG9ydCwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICk7XG59XG5cbmZ1bmN0aW9uIGV4dGVuZChzdXBlckNsYXNzLCBzdWJDbGFzc01ldGhvZHMgPSB7fSlcbntcbiAgICBmb3IodmFyIG1ldGhvZCBpbiBzdXBlckNsYXNzKXtcbiAgICAgICAgaWYoc3VwZXJDbGFzcy5oYXNPd25Qcm9wZXJ0eShtZXRob2QpICYmICFzdWJDbGFzc01ldGhvZHMuaGFzT3duUHJvcGVydHkobWV0aG9kKSl7XG4gICAgICAgICAgICBzdWJDbGFzc01ldGhvZHNbbWV0aG9kXSA9IHN1cGVyQ2xhc3NbbWV0aG9kXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3ViQ2xhc3NNZXRob2RzO1xufVxuXG5mdW5jdGlvbiBkZWVwQ29weShvYmopIHtcbiAgICB2YXIgdG8gPSB7fTtcblxuICAgIGZvciAodmFyIG5hbWUgaW4gb2JqKVxuICAgIHtcbiAgICAgICAgdG9bbmFtZV0gPSBvYmpbbmFtZV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gICAgd2hpY2hUcmFuc2l0aW9uRXZlbnQ6IHdoaWNoVHJhbnNpdGlvbkV2ZW50LFxuICAgIG1vYmlsZUFuZFRhYmxldGNoZWNrOiBtb2JpbGVBbmRUYWJsZXRjaGVjayxcbiAgICBpc0lvczogaXNJb3MsXG4gICAgaXNSZWFsSXBob25lOiBpc1JlYWxJcGhvbmUsXG4gICAgZm92VG9Qcm9qZWN0aW9uOiBmb3ZUb1Byb2plY3Rpb24sXG4gICAgZXh0ZW5kOiBleHRlbmQsXG4gICAgZGVlcENvcHk6IGRlZXBDb3B5XG59OyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gOC8xMy8xNi5cbiAqL1xuXG52YXIgVlJCdXR0b24gPSBmdW5jdGlvbihCdXR0b25Db21wb25lbnQpe1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBCdXR0b25Db21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGJ1aWxkQ1NTQ2xhc3M6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGB2anMtVlItY29udHJvbCAke0J1dHRvbkNvbXBvbmVudC5wcm90b3R5cGUuYnVpbGRDU1NDbGFzcy5jYWxsKHRoaXMpfWA7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlQ2xpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBjYW52YXMgPSB0aGlzLnBsYXllcigpLmdldENoaWxkKFwiQ2FudmFzXCIpO1xuICAgICAgICAgICAgKCFjYW52YXMuVlJNb2RlKT8gY2FudmFzLmVuYWJsZVZSKCkgOiBjYW52YXMuZGlzYWJsZVZSKCk7XG4gICAgICAgICAgICAoY2FudmFzLlZSTW9kZSk/IHRoaXMuYWRkQ2xhc3MoXCJlbmFibGVcIikgOiB0aGlzLnJlbW92ZUNsYXNzKFwiZW5hYmxlXCIpO1xuICAgICAgICAgICAgKGNhbnZhcy5WUk1vZGUpPyAgdGhpcy5wbGF5ZXIoKS50cmlnZ2VyKCdWUk1vZGVPbicpOiAgdGhpcy5wbGF5ZXIoKS50cmlnZ2VyKCdWUk1vZGVPZmYnKTtcbiAgICAgICAgfSxcblxuICAgICAgICBjb250cm9sVGV4dF86IFwiVlJcIlxuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IFZSQnV0dG9uOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxuICovXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCB1dGlsIGZyb20gJy4vbGliL1V0aWwnO1xuaW1wb3J0IERldGVjdG9yIGZyb20gJy4vbGliL0RldGVjdG9yJztcbmltcG9ydCBtYWtlVmlkZW9QbGF5YWJsZUlubGluZSBmcm9tICdpcGhvbmUtaW5saW5lLXZpZGVvJztcblxuY29uc3QgcnVuT25Nb2JpbGUgPSAodXRpbC5tb2JpbGVBbmRUYWJsZXRjaGVjaygpKTtcblxuLy8gRGVmYXVsdCBvcHRpb25zIGZvciB0aGUgcGx1Z2luLlxuY29uc3QgZGVmYXVsdHMgPSB7XG4gICAgY2xpY2tBbmREcmFnOiBydW5Pbk1vYmlsZSxcbiAgICBzaG93Tm90aWNlOiB0cnVlLFxuICAgIE5vdGljZU1lc3NhZ2U6IFwiUGxlYXNlIHVzZSB5b3VyIG1vdXNlIGRyYWcgYW5kIGRyb3AgdGhlIHZpZGVvLlwiLFxuICAgIGF1dG9IaWRlTm90aWNlOiAzMDAwLFxuICAgIC8vbGltaXQgdGhlIHZpZGVvIHNpemUgd2hlbiB1c2VyIHNjcm9sbC5cbiAgICBzY3JvbGxhYmxlOiB0cnVlLFxuICAgIGluaXRGb3Y6IDc1LFxuICAgIG1heEZvdjogMTA1LFxuICAgIG1pbkZvdjogNTEsXG4gICAgLy9pbml0aWFsIHBvc2l0aW9uIGZvciB0aGUgdmlkZW9cbiAgICBpbml0TGF0OiAwLFxuICAgIGluaXRMb246IC0xODAsXG4gICAgLy9BIGZsb2F0IHZhbHVlIGJhY2sgdG8gY2VudGVyIHdoZW4gbW91c2Ugb3V0IHRoZSBjYW52YXMuIFRoZSBoaWdoZXIsIHRoZSBmYXN0ZXIuXG4gICAgcmV0dXJuU3RlcExhdDogMC41LFxuICAgIHJldHVyblN0ZXBMb246IDIsXG4gICAgYmFja1RvVmVydGljYWxDZW50ZXI6ICFydW5Pbk1vYmlsZSxcbiAgICBiYWNrVG9Ib3Jpem9uQ2VudGVyOiAhcnVuT25Nb2JpbGUsXG4gICAgY2xpY2tUb1RvZ2dsZTogZmFsc2UsXG5cbiAgICAvL2xpbWl0IHZpZXdhYmxlIHpvb21cbiAgICBtaW5MYXQ6IC04NSxcbiAgICBtYXhMYXQ6IDg1LFxuXG4gICAgbWluTG9uOiAtSW5maW5pdHksXG4gICAgbWF4TG9uOiBJbmZpbml0eSxcblxuICAgIHZpZGVvVHlwZTogXCJlcXVpcmVjdGFuZ3VsYXJcIixcblxuICAgIHJvdGF0ZVg6IDAsXG4gICAgcm90YXRlWTogMCxcbiAgICByb3RhdGVaOiAwLFxuXG4gICAgYXV0b01vYmlsZU9yaWVudGF0aW9uOiBmYWxzZSxcbiAgICBtb2JpbGVWaWJyYXRpb25WYWx1ZTogdXRpbC5pc0lvcygpPyAwLjAyMiA6IDEsXG5cbiAgICBWUkVuYWJsZTogdHJ1ZSxcbiAgICBWUkdhcERlZ3JlZTogMi41LFxuXG4gICAgY2xvc2VQYW5vcmFtYTogZmFsc2VcblxuXG59O1xuXG5mdW5jdGlvbiBwbGF5ZXJSZXNpemUocGxheWVyKXtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS53aWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoICsgXCJweFwiO1xuICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS5oZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBmdWxsc2NyZWVuT25JT1MocGxheWVyLCBjbGlja0ZuKSB7XG4gICAgdmFyIHJlc2l6ZUZuID0gcGxheWVyUmVzaXplKHBsYXllcik7XG4gICAgcGxheWVyLmNvbnRyb2xCYXIuZnVsbHNjcmVlblRvZ2dsZS5vZmYoXCJ0YXBcIiwgY2xpY2tGbik7XG4gICAgcGxheWVyLmNvbnRyb2xCYXIuZnVsbHNjcmVlblRvZ2dsZS5vbihcInRhcFwiLCBmdW5jdGlvbiBmdWxsc2NyZWVuKCkge1xuICAgICAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICAgICAgaWYoIXBsYXllci5pc0Z1bGxzY3JlZW4oKSl7XG4gICAgICAgICAgICAvL3NldCB0byBmdWxsc2NyZWVuXG4gICAgICAgICAgICBwbGF5ZXIuaXNGdWxsc2NyZWVuKHRydWUpO1xuICAgICAgICAgICAgcGxheWVyLmVudGVyRnVsbFdpbmRvdygpO1xuICAgICAgICAgICAgcmVzaXplRm4oKTtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZGV2aWNlbW90aW9uXCIsIHJlc2l6ZUZuKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBwbGF5ZXIuaXNGdWxsc2NyZWVuKGZhbHNlKTtcbiAgICAgICAgICAgIHBsYXllci5leGl0RnVsbFdpbmRvdygpO1xuICAgICAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUud2lkdGggPSBcIlwiO1xuICAgICAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUuaGVpZ2h0ID0gXCJcIjtcbiAgICAgICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwiZGV2aWNlbW90aW9uXCIsIHJlc2l6ZUZuKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG4vKipcbiAqIEZ1bmN0aW9uIHRvIGludm9rZSB3aGVuIHRoZSBwbGF5ZXIgaXMgcmVhZHkuXG4gKlxuICogVGhpcyBpcyBhIGdyZWF0IHBsYWNlIGZvciB5b3VyIHBsdWdpbiB0byBpbml0aWFsaXplIGl0c2VsZi4gV2hlbiB0aGlzXG4gKiBmdW5jdGlvbiBpcyBjYWxsZWQsIHRoZSBwbGF5ZXIgd2lsbCBoYXZlIGl0cyBET00gYW5kIGNoaWxkIGNvbXBvbmVudHNcbiAqIGluIHBsYWNlLlxuICpcbiAqIEBmdW5jdGlvbiBvblBsYXllclJlYWR5XG4gKiBAcGFyYW0gICAge1BsYXllcn0gcGxheWVyXG4gKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gKi9cbmNvbnN0IG9uUGxheWVyUmVhZHkgPSAocGxheWVyLCBvcHRpb25zLCBzZXR0aW5ncykgPT4ge1xuICAgIHBsYXllci5hZGRDbGFzcygndmpzLXBhbm9yYW1hJyk7XG4gICAgaWYoIURldGVjdG9yLndlYmdsKXtcbiAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCB7XG4gICAgICAgICAgICBOb3RpY2VNZXNzYWdlOiBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpLFxuICAgICAgICAgICAgYXV0b0hpZGVOb3RpY2U6IG9wdGlvbnMuYXV0b0hpZGVOb3RpY2VcbiAgICAgICAgfSk7XG4gICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spe1xuICAgICAgICAgICAgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcGxheWVyLmFkZENoaWxkKCdDYW52YXMnLCB1dGlsLmRlZXBDb3B5KG9wdGlvbnMpKTtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICBpZihydW5Pbk1vYmlsZSl7XG4gICAgICAgIHZhciB2aWRlb0VsZW1lbnQgPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgIGlmKHV0aWwuaXNSZWFsSXBob25lKCkpe1xuICAgICAgICAgICAgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUodmlkZW9FbGVtZW50LCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBpZih1dGlsLmlzSW9zKCkpe1xuICAgICAgICAgICAgZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgc2V0dGluZ3MuZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSk7XG4gICAgICAgIH1cbiAgICAgICAgcGxheWVyLmFkZENsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW9cIik7XG4gICAgICAgIHBsYXllci5yZW1vdmVDbGFzcyhcInZqcy11c2luZy1uYXRpdmUtY29udHJvbHNcIik7XG4gICAgICAgIGNhbnZhcy5wbGF5T25Nb2JpbGUoKTtcbiAgICB9XG4gICAgaWYob3B0aW9ucy5zaG93Tm90aWNlKXtcbiAgICAgICAgcGxheWVyLm9uKFwicGxheWluZ1wiLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCB1dGlsLmRlZXBDb3B5KG9wdGlvbnMpKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGlmKG9wdGlvbnMuVlJFbmFibGUgJiYgb3B0aW9ucy52aWRlb1R5cGUgIT09IFwiM2RWaWRlb1wiKXtcbiAgICAgICAgcGxheWVyLmNvbnRyb2xCYXIuYWRkQ2hpbGQoJ1ZSQnV0dG9uJywge30sIHBsYXllci5jb250cm9sQmFyLmNoaWxkcmVuKCkubGVuZ3RoIC0gMSk7XG4gICAgfVxuICAgIGNhbnZhcy5oaWRlKCk7XG4gICAgcGxheWVyLm9uKFwicGxheVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5zaG93KCk7XG4gICAgfSk7XG4gICAgcGxheWVyLm9uKFwiZnVsbHNjcmVlbmNoYW5nZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICB9KTtcbiAgICBpZihvcHRpb25zLmNhbGxiYWNrKSBvcHRpb25zLmNhbGxiYWNrKCk7XG59O1xuXG5jb25zdCBQb3B1cE5vdGlmaWNhdGlvbiA9IChwbGF5ZXIsIG9wdGlvbnMgPSB7XG4gICAgTm90aWNlTWVzc2FnZTogXCJcIlxufSkgPT4ge1xuICAgIHZhciBub3RpY2UgPSBwbGF5ZXIuYWRkQ2hpbGQoJ05vdGljZScsIG9wdGlvbnMpO1xuXG4gICAgaWYob3B0aW9ucy5hdXRvSGlkZU5vdGljZSA+IDApe1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIG5vdGljZS5hZGRDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgIHZhciB0cmFuc2l0aW9uRXZlbnQgPSB1dGlsLndoaWNoVHJhbnNpdGlvbkV2ZW50KCk7XG4gICAgICAgICAgICB2YXIgaGlkZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5yZW1vdmVDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgICAgICBub3RpY2Uub2ZmKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgbm90aWNlLm9uKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgIH0sIG9wdGlvbnMuYXV0b0hpZGVOb3RpY2UpO1xuICAgIH1cbn07XG5cbmNvbnN0IHBsdWdpbiA9IGZ1bmN0aW9uKHNldHRpbmdzID0ge30pe1xuICAgIC8qKlxuICAgICAqIEEgdmlkZW8uanMgcGx1Z2luLlxuICAgICAqXG4gICAgICogSW4gdGhlIHBsdWdpbiBmdW5jdGlvbiwgdGhlIHZhbHVlIG9mIGB0aGlzYCBpcyBhIHZpZGVvLmpzIGBQbGF5ZXJgXG4gICAgICogaW5zdGFuY2UuIFlvdSBjYW5ub3QgcmVseSBvbiB0aGUgcGxheWVyIGJlaW5nIGluIGEgXCJyZWFkeVwiIHN0YXRlIGhlcmUsXG4gICAgICogZGVwZW5kaW5nIG9uIGhvdyB0aGUgcGx1Z2luIGlzIGludm9rZWQuIFRoaXMgbWF5IG9yIG1heSBub3QgYmUgaW1wb3J0YW50XG4gICAgICogdG8geW91OyBpZiBub3QsIHJlbW92ZSB0aGUgd2FpdCBmb3IgXCJyZWFkeVwiIVxuICAgICAqXG4gICAgICogQGZ1bmN0aW9uIHBhbm9yYW1hXG4gICAgICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICAgICAqICAgICAgICAgICBBbiBvYmplY3Qgb2Ygb3B0aW9ucyBsZWZ0IHRvIHRoZSBwbHVnaW4gYXV0aG9yIHRvIGRlZmluZS5cbiAgICAgKi9cbiAgICBjb25zdCB2aWRlb1R5cGVzID0gW1wiZXF1aXJlY3Rhbmd1bGFyXCIsIFwiZmlzaGV5ZVwiLCBcIjNkVmlkZW9cIl07XG4gICAgY29uc3QgcGFub3JhbWEgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIGlmKHNldHRpbmdzLm1lcmdlT3B0aW9uKSBvcHRpb25zID0gc2V0dGluZ3MubWVyZ2VPcHRpb24oZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgICAgICBpZih0eXBlb2Ygc2V0dGluZ3MuX2luaXQgPT09IFwidW5kZWZpbmVkXCIgfHwgdHlwZW9mIHNldHRpbmdzLl9pbml0ICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJwbHVnaW4gbXVzdCBpbXBsZW1lbnQgaW5pdCBmdW5jdGlvbigpLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZih2aWRlb1R5cGVzLmluZGV4T2Yob3B0aW9ucy52aWRlb1R5cGUpID09IC0xKSBvcHRpb25zLnZpZGVvVHlwZSA9IGRlZmF1bHRzLnZpZGVvVHlwZTtcbiAgICAgICAgc2V0dGluZ3MuX2luaXQob3B0aW9ucyk7XG4gICAgICAgIC8qIGltcGxlbWVudCBjYWxsYmFjayBmdW5jdGlvbiB3aGVuIHZpZGVvanMgaXMgcmVhZHkgKi9cbiAgICAgICAgdGhpcy5yZWFkeSgoKSA9PiB7XG4gICAgICAgICAgICBvblBsYXllclJlYWR5KHRoaXMsIG9wdGlvbnMsIHNldHRpbmdzKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuLy8gSW5jbHVkZSB0aGUgdmVyc2lvbiBudW1iZXIuXG4gICAgcGFub3JhbWEuVkVSU0lPTiA9ICcwLjEuMCc7XG5cbiAgICByZXR1cm4gcGFub3JhbWE7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBwbHVnaW47XG4iLCIndXNlIHN0cmljdCc7XG5cbmltcG9ydCBDYW52YXMgIGZyb20gJy4vbGliL0NhbnZhcyc7XG5pbXBvcnQgVGhyZWVEQ2FudmFzIGZyb20gJy4vbGliL1RocmVlQ2FudmFzJztcbmltcG9ydCBOb3RpY2UgIGZyb20gJy4vbGliL05vdGljZSc7XG5pbXBvcnQgSGVscGVyQ2FudmFzIGZyb20gJy4vbGliL0hlbHBlckNhbnZhcyc7XG5pbXBvcnQgVlJCdXR0b24gZnJvbSAnLi9saWIvVlJCdXR0b24nO1xuaW1wb3J0IHBhbm9yYW1hIGZyb20gJy4vcGx1Z2luJztcblxuZnVuY3Rpb24gZ2V0VGVjaChwbGF5ZXIpIHtcbiAgICByZXR1cm4gcGxheWVyLnRlY2goeyBJV2lsbE5vdFVzZVRoaXNJblBsdWdpbnM6IHRydWUgfSkuZWwoKTtcbn1cblxuZnVuY3Rpb24gZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSB7XG4gICAgcmV0dXJuIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUuaGFuZGxlQ2xpY2tcbn1cblxudmFyIGNvbXBvbmVudCA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KCdDb21wb25lbnQnKTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnTm90aWNlJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBub3RpY2UpKTtcblxudmFyIGhlbHBlckNhbnZhcyA9IEhlbHBlckNhbnZhcyhjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnSGVscGVyQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBoZWxwZXJDYW52YXMpKTtcblxudmFyIGJ1dHRvbiA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KFwiQnV0dG9uXCIpO1xudmFyIHZyQnRuID0gVlJCdXR0b24oYnV0dG9uKTtcbnZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ1ZSQnV0dG9uJywgdmlkZW9qcy5leHRlbmQoYnV0dG9uLCB2ckJ0bikpO1xuXG4vLyBSZWdpc3RlciB0aGUgcGx1Z2luIHdpdGggdmlkZW8uanMuXG52aWRlb2pzLnBsdWdpbigncGFub3JhbWEnLCBwYW5vcmFtYSh7XG4gICAgX2luaXQ6IGZ1bmN0aW9uKG9wdGlvbnMpe1xuICAgICAgICB2YXIgY2FudmFzID0gKG9wdGlvbnMudmlkZW9UeXBlICE9PSBcIjNkVmlkZW9cIik/XG4gICAgICAgICAgICBDYW52YXMoY29tcG9uZW50LCB3aW5kb3cuVEhSRUUsIHtcbiAgICAgICAgICAgICAgICBnZXRUZWNoOiBnZXRUZWNoXG4gICAgICAgICAgICB9KSA6XG4gICAgICAgICAgICBUaHJlZURDYW52YXMoY29tcG9uZW50LCB3aW5kb3cuVEhSRUUsIHtcbiAgICAgICAgICAgICAgICBnZXRUZWNoOiBnZXRUZWNoXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgdmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBjYW52YXMpKTtcbiAgICB9LFxuICAgIG1lcmdlT3B0aW9uOiBmdW5jdGlvbiAoZGVmYXVsdHMsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHZpZGVvanMubWVyZ2VPcHRpb25zKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICB9LFxuICAgIGdldFRlY2g6IGdldFRlY2gsXG4gICAgZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm46IGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuXG59KSk7XG4iXX0=
