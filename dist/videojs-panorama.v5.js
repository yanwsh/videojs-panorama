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

            if (options.callback) options.callback();
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
    panorama.VERSION = '0.0.9';

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwibm9kZV9tb2R1bGVzL3Bvb3ItbWFucy1zeW1ib2wvZGlzdC9wb29yLW1hbnMtc3ltYm9sLmNvbW1vbi1qcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9CYXNlQ2FudmFzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9UaHJlZUNhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvbGliL1ZSQnV0dG9uLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y1LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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SCxLQWIrQjtBQWNoQyxhQUFTLE9BZHVCO0FBZWhDLGdDQUE0QjtBQWZJLENBQVQsQ0FBM0IiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyohIG5wbS5pbS9pcGhvbmUtaW5saW5lLXZpZGVvICovXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wRGVmYXVsdCAoZXgpIHsgcmV0dXJuIChleCAmJiAodHlwZW9mIGV4ID09PSAnb2JqZWN0JykgJiYgJ2RlZmF1bHQnIGluIGV4KSA/IGV4WydkZWZhdWx0J10gOiBleDsgfVxuXG52YXIgU3ltYm9sID0gX2ludGVyb3BEZWZhdWx0KHJlcXVpcmUoJ3Bvb3ItbWFucy1zeW1ib2wnKSk7XG5cbmZ1bmN0aW9uIEludGVydmFsb21ldGVyKGNiKSB7XG5cdHZhciByYWZJZDtcblx0dmFyIHByZXZpb3VzTG9vcFRpbWU7XG5cdGZ1bmN0aW9uIGxvb3Aobm93KSB7XG5cdFx0Ly8gbXVzdCBiZSByZXF1ZXN0ZWQgYmVmb3JlIGNiKCkgYmVjYXVzZSB0aGF0IG1pZ2h0IGNhbGwgLnN0b3AoKVxuXHRcdHJhZklkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xuXHRcdGNiKG5vdyAtIChwcmV2aW91c0xvb3BUaW1lIHx8IG5vdykpOyAvLyBtcyBzaW5jZSBsYXN0IGNhbGwuIDAgb24gc3RhcnQoKVxuXHRcdHByZXZpb3VzTG9vcFRpbWUgPSBub3c7XG5cdH1cblx0dGhpcy5zdGFydCA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXJhZklkKSB7IC8vIHByZXZlbnQgZG91YmxlIHN0YXJ0c1xuXHRcdFx0bG9vcCgwKTtcblx0XHR9XG5cdH07XG5cdHRoaXMuc3RvcCA9IGZ1bmN0aW9uICgpIHtcblx0XHRjYW5jZWxBbmltYXRpb25GcmFtZShyYWZJZCk7XG5cdFx0cmFmSWQgPSBudWxsO1xuXHRcdHByZXZpb3VzTG9vcFRpbWUgPSAwO1xuXHR9O1xufVxuXG5mdW5jdGlvbiBwcmV2ZW50RXZlbnQoZWxlbWVudCwgZXZlbnROYW1lLCB0b2dnbGVQcm9wZXJ0eSwgcHJldmVudFdpdGhQcm9wZXJ0eSkge1xuXHRmdW5jdGlvbiBoYW5kbGVyKGUpIHtcblx0XHRpZiAoQm9vbGVhbihlbGVtZW50W3RvZ2dsZVByb3BlcnR5XSkgPT09IEJvb2xlYW4ocHJldmVudFdpdGhQcm9wZXJ0eSkpIHtcblx0XHRcdGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHQvLyBjb25zb2xlLmxvZyhldmVudE5hbWUsICdwcmV2ZW50ZWQgb24nLCBlbGVtZW50KTtcblx0XHR9XG5cdFx0ZGVsZXRlIGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldO1xuXHR9XG5cdGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGhhbmRsZXIsIGZhbHNlKTtcblxuXHQvLyBSZXR1cm4gaGFuZGxlciB0byBhbGxvdyB0byBkaXNhYmxlIHRoZSBwcmV2ZW50aW9uLiBVc2FnZTpcblx0Ly8gY29uc3QgcHJldmVudGlvbkhhbmRsZXIgPSBwcmV2ZW50RXZlbnQoZWwsICdjbGljaycpO1xuXHQvLyBlbC5yZW1vdmVFdmVudEhhbmRsZXIoJ2NsaWNrJywgcHJldmVudGlvbkhhbmRsZXIpO1xuXHRyZXR1cm4gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcHJveHlQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwgc291cmNlT2JqZWN0LCBjb3B5Rmlyc3QpIHtcblx0ZnVuY3Rpb24gZ2V0KCkge1xuXHRcdHJldHVybiBzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXTtcblx0fVxuXHRmdW5jdGlvbiBzZXQodmFsdWUpIHtcblx0XHRzb3VyY2VPYmplY3RbcHJvcGVydHlOYW1lXSA9IHZhbHVlO1xuXHR9XG5cblx0aWYgKGNvcHlGaXJzdCkge1xuXHRcdHNldChvYmplY3RbcHJvcGVydHlOYW1lXSk7XG5cdH1cblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHtnZXQ6IGdldCwgc2V0OiBzZXR9KTtcbn1cblxuZnVuY3Rpb24gcHJveHlFdmVudChvYmplY3QsIGV2ZW50TmFtZSwgc291cmNlT2JqZWN0KSB7XG5cdHNvdXJjZU9iamVjdC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gb2JqZWN0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KGV2ZW50TmFtZSkpOyB9KTtcbn1cblxuZnVuY3Rpb24gZGlzcGF0Y2hFdmVudEFzeW5jKGVsZW1lbnQsIHR5cGUpIHtcblx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0ZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCh0eXBlKSk7XG5cdH0pO1xufVxuXG4vLyBpT1MgMTAgYWRkcyBzdXBwb3J0IGZvciBuYXRpdmUgaW5saW5lIHBsYXliYWNrICsgc2lsZW50IGF1dG9wbGF5XG4vLyBBbHNvIGFkZHMgdW5wcmVmaXhlZCBjc3MtZ3JpZC4gVGhpcyBjaGVjayBlc3NlbnRpYWxseSBleGNsdWRlc1xudmFyIGlzV2hpdGVsaXN0ZWQgPSAvaVBob25lfGlQb2QvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpICYmIGRvY3VtZW50LmhlYWQuc3R5bGUuZ3JpZCA9PT0gdW5kZWZpbmVkO1xuXG52YXIg4LKgID0gU3ltYm9sKCk7XG52YXIg4LKgZXZlbnQgPSBTeW1ib2woKTtcbnZhciDgsqBwbGF5ID0gU3ltYm9sKCduYXRpdmVwbGF5Jyk7XG52YXIg4LKgcGF1c2UgPSBTeW1ib2woJ25hdGl2ZXBhdXNlJyk7XG5cbi8qKlxuICogVVRJTFNcbiAqL1xuXG5mdW5jdGlvbiBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbykge1xuXHR2YXIgYXVkaW8gPSBuZXcgQXVkaW8oKTtcblx0cHJveHlFdmVudCh2aWRlbywgJ3BsYXknLCBhdWRpbyk7XG5cdHByb3h5RXZlbnQodmlkZW8sICdwbGF5aW5nJywgYXVkaW8pO1xuXHRwcm94eUV2ZW50KHZpZGVvLCAncGF1c2UnLCBhdWRpbyk7XG5cdGF1ZGlvLmNyb3NzT3JpZ2luID0gdmlkZW8uY3Jvc3NPcmlnaW47XG5cblx0Ly8gJ2RhdGE6JyBjYXVzZXMgYXVkaW8ubmV0d29ya1N0YXRlID4gMFxuXHQvLyB3aGljaCB0aGVuIGFsbG93cyB0byBrZWVwIDxhdWRpbz4gaW4gYSByZXN1bWFibGUgcGxheWluZyBzdGF0ZVxuXHQvLyBpLmUuIG9uY2UgeW91IHNldCBhIHJlYWwgc3JjIGl0IHdpbGwga2VlcCBwbGF5aW5nIGlmIGl0IHdhcyBpZiAucGxheSgpIHdhcyBjYWxsZWRcblx0YXVkaW8uc3JjID0gdmlkZW8uc3JjIHx8IHZpZGVvLmN1cnJlbnRTcmMgfHwgJ2RhdGE6JztcblxuXHQvLyBpZiAoYXVkaW8uc3JjID09PSAnZGF0YTonKSB7XG5cdC8vICAgVE9ETzogd2FpdCBmb3IgdmlkZW8gdG8gYmUgc2VsZWN0ZWRcblx0Ly8gfVxuXHRyZXR1cm4gYXVkaW87XG59XG5cbnZhciBsYXN0UmVxdWVzdHMgPSBbXTtcbnZhciByZXF1ZXN0SW5kZXggPSAwO1xudmFyIGxhc3RUaW1ldXBkYXRlRXZlbnQ7XG5cbmZ1bmN0aW9uIHNldFRpbWUodmlkZW8sIHRpbWUsIHJlbWVtYmVyT25seSkge1xuXHQvLyBhbGxvdyBvbmUgdGltZXVwZGF0ZSBldmVudCBldmVyeSAyMDArIG1zXG5cdGlmICgobGFzdFRpbWV1cGRhdGVFdmVudCB8fCAwKSArIDIwMCA8IERhdGUubm93KCkpIHtcblx0XHR2aWRlb1vgsqBldmVudF0gPSB0cnVlO1xuXHRcdGxhc3RUaW1ldXBkYXRlRXZlbnQgPSBEYXRlLm5vdygpO1xuXHR9XG5cdGlmICghcmVtZW1iZXJPbmx5KSB7XG5cdFx0dmlkZW8uY3VycmVudFRpbWUgPSB0aW1lO1xuXHR9XG5cdGxhc3RSZXF1ZXN0c1srK3JlcXVlc3RJbmRleCAlIDNdID0gdGltZSAqIDEwMCB8IDAgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIGlzUGxheWVyRW5kZWQocGxheWVyKSB7XG5cdHJldHVybiBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID49IHBsYXllci52aWRlby5kdXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gdXBkYXRlKHRpbWVEaWZmKSB7XG5cdHZhciBwbGF5ZXIgPSB0aGlzO1xuXHQvLyBjb25zb2xlLmxvZygndXBkYXRlJywgcGxheWVyLnZpZGVvLnJlYWR5U3RhdGUsIHBsYXllci52aWRlby5uZXR3b3JrU3RhdGUsIHBsYXllci5kcml2ZXIucmVhZHlTdGF0ZSwgcGxheWVyLmRyaXZlci5uZXR3b3JrU3RhdGUsIHBsYXllci5kcml2ZXIucGF1c2VkKTtcblx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0ZVVFVSRV9EQVRBKSB7XG5cdFx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSBwbGF5ZXIudmlkZW8uY3VycmVudFRpbWUgKyAodGltZURpZmYgKiBwbGF5ZXIudmlkZW8ucGxheWJhY2tSYXRlKSAvIDEwMDA7XG5cdFx0XHRpZiAocGxheWVyLnZpZGVvLmxvb3AgJiYgaXNQbGF5ZXJFbmRlZChwbGF5ZXIpKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSAwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzZXRUaW1lKHBsYXllci52aWRlbywgcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSk7XG5cdH0gZWxzZSBpZiAocGxheWVyLnZpZGVvLm5ldHdvcmtTdGF0ZSA9PT0gcGxheWVyLnZpZGVvLk5FVFdPUktfSURMRSAmJiAhcGxheWVyLnZpZGVvLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdC8vIHRoaXMgc2hvdWxkIGhhcHBlbiB3aGVuIHRoZSBzb3VyY2UgaXMgYXZhaWxhYmxlIGJ1dDpcblx0XHQvLyAtIGl0J3MgcG90ZW50aWFsbHkgcGxheWluZyAoLnBhdXNlZCA9PT0gZmFsc2UpXG5cdFx0Ly8gLSBpdCdzIG5vdCByZWFkeSB0byBwbGF5XG5cdFx0Ly8gLSBpdCdzIG5vdCBsb2FkaW5nXG5cdFx0Ly8gSWYgaXQgaGFzQXVkaW8sIHRoYXQgd2lsbCBiZSBsb2FkZWQgaW4gdGhlICdlbXB0aWVkJyBoYW5kbGVyIGJlbG93XG5cdFx0cGxheWVyLnZpZGVvLmxvYWQoKTtcblx0XHQvLyBjb25zb2xlLmxvZygnV2lsbCBsb2FkJyk7XG5cdH1cblxuXHQvLyBjb25zb2xlLmFzc2VydChwbGF5ZXIudmlkZW8uY3VycmVudFRpbWUgPT09IHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUsICdWaWRlbyBub3QgdXBkYXRpbmchJyk7XG5cblx0aWYgKHBsYXllci52aWRlby5lbmRlZCkge1xuXHRcdGRlbGV0ZSBwbGF5ZXIudmlkZW9b4LKgZXZlbnRdOyAvLyBhbGxvdyB0aW1ldXBkYXRlIGV2ZW50XG5cdFx0cGxheWVyLnZpZGVvLnBhdXNlKHRydWUpO1xuXHR9XG59XG5cbi8qKlxuICogTUVUSE9EU1xuICovXG5cbmZ1bmN0aW9uIHBsYXkoKSB7XG5cdC8vIGNvbnNvbGUubG9nKCdwbGF5Jyk7XG5cdHZhciB2aWRlbyA9IHRoaXM7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXG5cdC8vIGlmIGl0J3MgZnVsbHNjcmVlbiwgdXNlIHRoZSBuYXRpdmUgcGxheWVyXG5cdGlmICh2aWRlby53ZWJraXREaXNwbGF5aW5nRnVsbHNjcmVlbikge1xuXHRcdHZpZGVvW+CyoHBsYXldKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKHBsYXllci5kcml2ZXIuc3JjICE9PSAnZGF0YTonICYmIHBsYXllci5kcml2ZXIuc3JjICE9PSB2aWRlby5zcmMpIHtcblx0XHQvLyBjb25zb2xlLmxvZygnc3JjIGNoYW5nZWQgb24gcGxheScsIHZpZGVvLnNyYyk7XG5cdFx0c2V0VGltZSh2aWRlbywgMCwgdHJ1ZSk7XG5cdFx0cGxheWVyLmRyaXZlci5zcmMgPSB2aWRlby5zcmM7XG5cdH1cblxuXHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRwbGF5ZXIucGF1c2VkID0gZmFsc2U7XG5cblx0aWYgKCF2aWRlby5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHQvLyAubG9hZCgpIGNhdXNlcyB0aGUgZW1wdGllZCBldmVudFxuXHRcdC8vIHRoZSBhbHRlcm5hdGl2ZSBpcyAucGxheSgpKy5wYXVzZSgpIGJ1dCB0aGF0IHRyaWdnZXJzIHBsYXkvcGF1c2UgZXZlbnRzLCBldmVuIHdvcnNlXG5cdFx0Ly8gcG9zc2libHkgdGhlIGFsdGVybmF0aXZlIGlzIHByZXZlbnRpbmcgdGhpcyBldmVudCBvbmx5IG9uY2Vcblx0XHR2aWRlby5sb2FkKCk7XG5cdH1cblxuXHRwbGF5ZXIuZHJpdmVyLnBsYXkoKTtcblx0cGxheWVyLnVwZGF0ZXIuc3RhcnQoKTtcblxuXHRpZiAoIXBsYXllci5oYXNBdWRpbykge1xuXHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ3BsYXknKTtcblx0XHRpZiAocGxheWVyLnZpZGVvLnJlYWR5U3RhdGUgPj0gcGxheWVyLnZpZGVvLkhBVkVfRU5PVUdIX0RBVEEpIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKCdvbnBsYXknKTtcblx0XHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ3BsYXlpbmcnKTtcblx0XHR9XG5cdH1cbn1cbmZ1bmN0aW9uIHBhdXNlKGZvcmNlRXZlbnRzKSB7XG5cdC8vIGNvbnNvbGUubG9nKCdwYXVzZScpO1xuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHRwbGF5ZXIuZHJpdmVyLnBhdXNlKCk7XG5cdHBsYXllci51cGRhdGVyLnN0b3AoKTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHRoZSBkZXZlbG9wZXIgdGhlIG5hdGl2ZSBwbGF5ZXIucGF1c2UoKVxuXHQvLyBUaGlzIGlzIGF0IHRoZSBlbmQgb2YgcGF1c2UoKSBiZWNhdXNlIGl0IGFsc29cblx0Ly8gbmVlZHMgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHNpbXVsYXRpb24gaXMgcGF1c2VkXG5cdGlmICh2aWRlby53ZWJraXREaXNwbGF5aW5nRnVsbHNjcmVlbikge1xuXHRcdHZpZGVvW+CyoHBhdXNlXSgpO1xuXHR9XG5cblx0aWYgKHBsYXllci5wYXVzZWQgJiYgIWZvcmNlRXZlbnRzKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cGxheWVyLnBhdXNlZCA9IHRydWU7XG5cdGlmICghcGxheWVyLmhhc0F1ZGlvKSB7XG5cdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGF1c2UnKTtcblx0fVxuXHRpZiAodmlkZW8uZW5kZWQpIHtcblx0XHR2aWRlb1vgsqBldmVudF0gPSB0cnVlO1xuXHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ2VuZGVkJyk7XG5cdH1cbn1cblxuLyoqXG4gKiBTRVRVUFxuICovXG5cbmZ1bmN0aW9uIGFkZFBsYXllcih2aWRlbywgaGFzQXVkaW8pIHtcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF0gPSB7fTtcblx0cGxheWVyLnBhdXNlZCA9IHRydWU7IC8vIHRyYWNrIHdoZXRoZXIgJ3BhdXNlJyBldmVudHMgaGF2ZSBiZWVuIGZpcmVkXG5cdHBsYXllci5oYXNBdWRpbyA9IGhhc0F1ZGlvO1xuXHRwbGF5ZXIudmlkZW8gPSB2aWRlbztcblx0cGxheWVyLnVwZGF0ZXIgPSBuZXcgSW50ZXJ2YWxvbWV0ZXIodXBkYXRlLmJpbmQocGxheWVyKSk7XG5cblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0cGxheWVyLmRyaXZlciA9IGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKTtcblx0fSBlbHNlIHtcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ29uY2FucGxheScpO1xuXHRcdFx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5aW5nJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cGxheWVyLmRyaXZlciA9IHtcblx0XHRcdHNyYzogdmlkZW8uc3JjIHx8IHZpZGVvLmN1cnJlbnRTcmMgfHwgJ2RhdGE6Jyxcblx0XHRcdG11dGVkOiB0cnVlLFxuXHRcdFx0cGF1c2VkOiB0cnVlLFxuXHRcdFx0cGF1c2U6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdHBsYXk6IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSBmYWxzZTtcblx0XHRcdFx0Ly8gbWVkaWEgYXV0b21hdGljYWxseSBnb2VzIHRvIDAgaWYgLnBsYXkoKSBpcyBjYWxsZWQgd2hlbiBpdCdzIGRvbmVcblx0XHRcdFx0aWYgKGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRcdHNldFRpbWUodmlkZW8sIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGVuZGVkKCkge1xuXHRcdFx0XHRyZXR1cm4gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyAubG9hZCgpIGNhdXNlcyB0aGUgZW1wdGllZCBldmVudFxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbXB0aWVkJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdkcml2ZXIgc3JjIGlzJywgcGxheWVyLmRyaXZlci5zcmMpO1xuXHRcdHZhciB3YXNFbXB0eSA9ICFwbGF5ZXIuZHJpdmVyLnNyYyB8fCBwbGF5ZXIuZHJpdmVyLnNyYyA9PT0gJ2RhdGE6Jztcblx0XHRpZiAocGxheWVyLmRyaXZlci5zcmMgJiYgcGxheWVyLmRyaXZlci5zcmMgIT09IHZpZGVvLnNyYykge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkIHRvJywgdmlkZW8uc3JjKTtcblx0XHRcdHNldFRpbWUodmlkZW8sIDAsIHRydWUpO1xuXHRcdFx0cGxheWVyLmRyaXZlci5zcmMgPSB2aWRlby5zcmM7XG5cdFx0XHQvLyBwbGF5aW5nIHZpZGVvcyB3aWxsIG9ubHkga2VlcCBwbGF5aW5nIGlmIG5vIHNyYyB3YXMgcHJlc2VudCB3aGVuIC5wbGF5KCnigJllZFxuXHRcdFx0aWYgKHdhc0VtcHR5KSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGxheSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGxheWVyLnVwZGF0ZXIuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSwgZmFsc2UpO1xuXG5cdC8vIHN0b3AgcHJvZ3JhbW1hdGljIHBsYXllciB3aGVuIE9TIHRha2VzIG92ZXJcblx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0YmVnaW5mdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdGhhdCB0aGUgPGF1ZGlvPiBhbmQgdGhlIHN5bmNlci91cGRhdGVyIGFyZSBzdG9wcGVkXG5cdFx0XHR2aWRlby5wYXVzZSgpO1xuXG5cdFx0XHQvLyBwbGF5IHZpZGVvIG5hdGl2ZWx5XG5cdFx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdH0gZWxzZSBpZiAoaGFzQXVkaW8gJiYgIXBsYXllci5kcml2ZXIuYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0XHQvLyBpZiB0aGUgZmlyc3QgcGxheSBpcyBuYXRpdmUsXG5cdFx0XHQvLyB0aGUgPGF1ZGlvPiBuZWVkcyB0byBiZSBidWZmZXJlZCBtYW51YWxseVxuXHRcdFx0Ly8gc28gd2hlbiB0aGUgZnVsbHNjcmVlbiBlbmRzLCBpdCBjYW4gYmUgc2V0IHRvIHRoZSBzYW1lIGN1cnJlbnQgdGltZVxuXHRcdFx0cGxheWVyLmRyaXZlci5sb2FkKCk7XG5cdFx0fVxuXHR9KTtcblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0ZW5kZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIHN5bmMgYXVkaW8gdG8gbmV3IHZpZGVvIHBvc2l0aW9uXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHQvLyBjb25zb2xlLmFzc2VydChwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID09PSB2aWRlby5jdXJyZW50VGltZSwgJ0F1ZGlvIG5vdCBzeW5jZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIGFsbG93IHNlZWtpbmdcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVraW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKGxhc3RSZXF1ZXN0cy5pbmRleE9mKHZpZGVvLmN1cnJlbnRUaW1lICogMTAwIHwgMCAvIDEwMCkgPCAwKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdVc2VyLXJlcXVlc3RlZCBzZWVraW5nJyk7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBvdmVybG9hZEFQSSh2aWRlbykge1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblx0dmlkZW9b4LKgcGxheV0gPSB2aWRlby5wbGF5O1xuXHR2aWRlb1vgsqBwYXVzZV0gPSB2aWRlby5wYXVzZTtcblx0dmlkZW8ucGxheSA9IHBsYXk7XG5cdHZpZGVvLnBhdXNlID0gcGF1c2U7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwYXVzZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ211dGVkJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdwbGF5YmFja1JhdGUnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2VuZGVkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdsb29wJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtpbmcnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2VkJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3RpbWV1cGRhdGUnLCDgsqBldmVudCwgZmFsc2UpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdlbmRlZCcsIOCyoGV2ZW50LCBmYWxzZSk7IC8vIHByZXZlbnQgb2NjYXNpb25hbCBuYXRpdmUgZW5kZWQgZXZlbnRzXG59XG5cbmZ1bmN0aW9uIGVuYWJsZUlubGluZVZpZGVvKHZpZGVvLCBoYXNBdWRpbywgb25seVdoaXRlbGlzdGVkKSB7XG5cdGlmICggaGFzQXVkaW8gPT09IHZvaWQgMCApIGhhc0F1ZGlvID0gdHJ1ZTtcblx0aWYgKCBvbmx5V2hpdGVsaXN0ZWQgPT09IHZvaWQgMCApIG9ubHlXaGl0ZWxpc3RlZCA9IHRydWU7XG5cblx0aWYgKChvbmx5V2hpdGVsaXN0ZWQgJiYgIWlzV2hpdGVsaXN0ZWQpIHx8IHZpZGVvW+CyoF0pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbyk7XG5cdG92ZXJsb2FkQVBJKHZpZGVvKTtcblx0dmlkZW8uY2xhc3NMaXN0LmFkZCgnSUlWJyk7XG5cdGlmICghaGFzQXVkaW8gJiYgdmlkZW8uYXV0b3BsYXkpIHtcblx0XHR2aWRlby5wbGF5KCk7XG5cdH1cblx0aWYgKG5hdmlnYXRvci5wbGF0Zm9ybSA9PT0gJ01hY0ludGVsJyB8fCBuYXZpZ2F0b3IucGxhdGZvcm0gPT09ICdXaW5kb3dzJykge1xuXHRcdGNvbnNvbGUud2FybignaXBob25lLWlubGluZS12aWRlbyBpcyBub3QgZ3VhcmFudGVlZCB0byB3b3JrIGluIGVtdWxhdGVkIGVudmlyb25tZW50cycpO1xuXHR9XG59XG5cbmVuYWJsZUlubGluZVZpZGVvLmlzV2hpdGVsaXN0ZWQgPSBpc1doaXRlbGlzdGVkO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGVuYWJsZUlubGluZVZpZGVvOyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGluZGV4ID0gdHlwZW9mIFN5bWJvbCA9PT0gJ3VuZGVmaW5lZCcgPyBmdW5jdGlvbiAoZGVzY3JpcHRpb24pIHtcblx0cmV0dXJuICdAJyArIChkZXNjcmlwdGlvbiB8fCAnQCcpICsgTWF0aC5yYW5kb20oKTtcbn0gOiBTeW1ib2w7XG5cbm1vZHVsZS5leHBvcnRzID0gaW5kZXg7IiwiLyoqXG4gKlxuICogKGMpIFdlbnNoZW5nIFlhbiA8eWFud3NoQGdtYWlsLmNvbT5cbiAqIERhdGU6IDEwLzMwLzE2XG4gKlxuICogRm9yIHRoZSBmdWxsIGNvcHlyaWdodCBhbmQgbGljZW5zZSBpbmZvcm1hdGlvbiwgcGxlYXNlIHZpZXcgdGhlIExJQ0VOU0VcbiAqIGZpbGUgdGhhdCB3YXMgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzIHNvdXJjZSBjb2RlLlxuICovXG4ndXNlIHN0cmljdCc7XG5cbmltcG9ydCBEZXRlY3RvciBmcm9tICcuLi9saWIvRGV0ZWN0b3InO1xuaW1wb3J0IE1vYmlsZUJ1ZmZlcmluZyBmcm9tICcuLi9saWIvTW9iaWxlQnVmZmVyaW5nJztcblxuY29uc3QgSEFWRV9FTk9VR0hfREFUQSA9IDQ7XG5cbnZhciBCYXNlQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBvcHRpb25zO1xuICAgICAgICAgICAgLy9iYXNpYyBzZXR0aW5nc1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHBsYXllci5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMubG9uID0gb3B0aW9ucy5pbml0TG9uLCB0aGlzLmxhdCA9IG9wdGlvbnMuaW5pdExhdCwgdGhpcy5waGkgPSAwLCB0aGlzLnRoZXRhID0gMDtcbiAgICAgICAgICAgIHRoaXMudmlkZW9UeXBlID0gb3B0aW9ucy52aWRlb1R5cGU7XG4gICAgICAgICAgICB0aGlzLmNsaWNrVG9Ub2dnbGUgPSBvcHRpb25zLmNsaWNrVG9Ub2dnbGU7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvL2RlZmluZSByZW5kZXJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmF1dG9DbGVhciA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDbGVhckNvbG9yKDB4MDAwMDAwLCAxKTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgdGV4dHVyZSwgb24gaWUgMTEsIHdlIG5lZWQgYWRkaXRpb25hbCBoZWxwZXIgY2FudmFzIHRvIHNvbHZlIHJlbmRlcmluZyBpc3N1ZS5cbiAgICAgICAgICAgIHZhciB2aWRlbyA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcbiAgICAgICAgICAgIHRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSA9IERldGVjdG9yLnN1cHBvcnRWaWRlb1RleHR1cmUoKTtcbiAgICAgICAgICAgIGlmKCF0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUpe1xuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzID0gcGxheWVyLmFkZENoaWxkKFwiSGVscGVyQ2FudmFzXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgdmlkZW86IHZpZGVvLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmhlaWdodFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZXh0ID0gdGhpcy5oZWxwZXJDYW52YXMuZWwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZShjb250ZXh0KTtcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKHZpZGVvKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmlkZW8uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1heEZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG5cbiAgICAgICAgICAgIHRoaXMuZWxfID0gdGhpcy5yZW5kZXJlci5kb21FbGVtZW50O1xuICAgICAgICAgICAgdGhpcy5lbF8uY2xhc3NMaXN0LmFkZCgndmpzLXZpZGVvLWNhbnZhcycpO1xuXG4gICAgICAgICAgICBvcHRpb25zLmVsID0gdGhpcy5lbF87XG4gICAgICAgICAgICBiYXNlQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgdGhpcy5hdHRhY2hDb250cm9sRXZlbnRzKCk7XG4gICAgICAgICAgICB0aGlzLnBsYXllcigpLm9uKFwicGxheVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmltYXRlKCk7XG4gICAgICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGF0dGFjaENvbnRyb2xFdmVudHM6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZW1vdmUnLCB0aGlzLmhhbmRsZU1vdXNlTW92ZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNobW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2Vkb3duJywgdGhpcy5oYW5kbGVNb3VzZURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaHN0YXJ0Jyx0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNldXAnLCB0aGlzLmhhbmRsZU1vdXNlVXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaGVuZCcsIHRoaXMuaGFuZGxlTW91c2VVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3Muc2Nyb2xsYWJsZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5vbignbW91c2V3aGVlbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgICAgICB0aGlzLm9uKCdNb3pNb3VzZVBpeGVsU2Nyb2xsJywgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5vbignbW91c2VlbnRlcicsIHRoaXMuaGFuZGxlTW91c2VFbnRlci5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbGVhdmUnLCB0aGlzLmhhbmRsZU1vdXNlTGVhc2UuYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlUmVzaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5wbGF5ZXIoKS5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHRoaXMucGxheWVyKCkuZWwoKS5vZmZzZXRIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUoIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VVcDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSBmYWxzZTtcbiAgICAgICAgICAgIGlmKHRoaXMuY2xpY2tUb1RvZ2dsZSl7XG4gICAgICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LmNoYW5nZWRUb3VjaGVzICYmIGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LmNoYW5nZWRUb3VjaGVzICYmIGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIGNsaWVudFggPT09IFwidW5kZWZpbmVkXCIgfHwgY2xpZW50WSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHZhciBkaWZmWCA9IE1hdGguYWJzKGNsaWVudFggLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCk7XG4gICAgICAgICAgICAgICAgdmFyIGRpZmZZID0gTWF0aC5hYnMoY2xpZW50WSAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZKTtcbiAgICAgICAgICAgICAgICBpZihkaWZmWCA8IDAuMSAmJiBkaWZmWSA8IDAuMSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5wYXVzZWQoKSA/IHRoaXMucGxheWVyKCkucGxheSgpIDogdGhpcy5wbGF5ZXIoKS5wYXVzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlRG93bjogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WTtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBjbGllbnRYID09PSBcInVuZGVmaW5lZFwiIHx8IGNsaWVudFkgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYID0gY2xpZW50WDtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZID0gY2xpZW50WTtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxvbiA9IHRoaXMubG9uO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duTGF0ID0gdGhpcy5sYXQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VNb3ZlOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgY2xpZW50WCA9IGV2ZW50LmNsaWVudFggfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICBpZih0eXBlb2YgY2xpZW50WCA9PT0gXCJ1bmRlZmluZWRcIiB8fCBjbGllbnRZID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmNsaWNrQW5kRHJhZyl7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5tb3VzZURvd24pe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICggdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclggLSBjbGllbnRYICkgKiAwLjIgKyB0aGlzLm9uUG9pbnRlckRvd25Mb247XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKCBjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkgKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxhdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnBhZ2VYIC0gdGhpcy5lbF8ub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGV2ZW50LnBhZ2VZIC0gdGhpcy5lbF8ub2Zmc2V0VG9wO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKHggLyB0aGlzLndpZHRoKSAqIDQzMCAtIDIyNTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICh5IC8gdGhpcy5oZWlnaHQpICogLTE4MCArIDkwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vYmlsZU9yaWVudGF0aW9uOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBldmVudC5yb3RhdGlvblJhdGUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIHZhciB4ID0gZXZlbnQucm90YXRpb25SYXRlLmFscGhhO1xuICAgICAgICAgICAgdmFyIHkgPSBldmVudC5yb3RhdGlvblJhdGUuYmV0YTtcbiAgICAgICAgICAgIHZhciBwb3J0cmFpdCA9ICh0eXBlb2YgZXZlbnQucG9ydHJhaXQgIT09IFwidW5kZWZpbmVkXCIpPyBldmVudC5wb3J0cmFpdCA6IHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBwb3J0cmFpdClcIikubWF0Y2hlcztcbiAgICAgICAgICAgIHZhciBsYW5kc2NhcGUgPSAodHlwZW9mIGV2ZW50LmxhbmRzY2FwZSAhPT0gXCJ1bmRlZmluZWRcIik/IGV2ZW50LmxhbmRzY2FwZSA6IHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBsYW5kc2NhcGUpXCIpLm1hdGNoZXM7XG4gICAgICAgICAgICB2YXIgb3JpZW50YXRpb24gPSBldmVudC5vcmllbnRhdGlvbiB8fCB3aW5kb3cub3JpZW50YXRpb247XG5cbiAgICAgICAgICAgIGlmIChwb3J0cmFpdCkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gdGhpcy5sb24gLSB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IHRoaXMubGF0ICsgeCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICB9ZWxzZSBpZihsYW5kc2NhcGUpe1xuICAgICAgICAgICAgICAgIHZhciBvcmllbnRhdGlvbkRlZ3JlZSA9IC05MDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2Ygb3JpZW50YXRpb24gIT0gXCJ1bmRlZmluZWRcIil7XG4gICAgICAgICAgICAgICAgICAgIG9yaWVudGF0aW9uRGVncmVlID0gb3JpZW50YXRpb247XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSAob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKT8gdGhpcy5sb24gKyB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZSA6IHRoaXMubG9uIC0geCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKT8gdGhpcy5sYXQgKyB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZSA6IHRoaXMubGF0IC0geSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlRW50ZXI6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VMZWFzZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYW5pbWF0ZTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMucmVxdWVzdEFuaW1hdGlvbklkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCB0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSApO1xuICAgICAgICAgICAgaWYoIXRoaXMucGxheWVyKCkucGF1c2VkKCkpe1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZih0aGlzLnRleHR1cmUpICE9PSBcInVuZGVmaW5lZFwiICYmICghdGhpcy5pc1BsYXlPbk1vYmlsZSAmJiB0aGlzLnBsYXllcigpLnJlYWR5U3RhdGUoKSA9PT0gSEFWRV9FTk9VR0hfREFUQSB8fCB0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyKCkuaGFzQ2xhc3MoXCJ2anMtcGxheWluZ1wiKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdCAtIHRoaXMudGltZSA+PSAzMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IGN0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmKHRoaXMuaXNQbGF5T25Nb2JpbGUpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnRUaW1lID0gdGhpcy5wbGF5ZXIoKS5jdXJyZW50VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYoTW9iaWxlQnVmZmVyaW5nLmlzQnVmZmVyaW5nKGN1cnJlbnRUaW1lKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIXRoaXMucGxheWVyKCkuaGFzQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLmFkZENsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKHRoaXMucGxheWVyKCkuaGFzQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLnJlbW92ZUNsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgaWYoIXRoaXMuaXNVc2VySW50ZXJhY3Rpbmcpe1xuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMYXQgPSAodGhpcy5sYXQgPiB0aGlzLnNldHRpbmdzLmluaXRMYXQpPyAgLTEgOiAxO1xuICAgICAgICAgICAgICAgIHZhciBzeW1ib2xMb24gPSAodGhpcy5sb24gPiB0aGlzLnNldHRpbmdzLmluaXRMb24pPyAgLTEgOiAxO1xuICAgICAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYmFja1RvVmVydGljYWxDZW50ZXIpe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IChcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID4gKHRoaXMuc2V0dGluZ3MuaW5pdExhdCAtIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCkpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA8ICh0aGlzLnNldHRpbmdzLmluaXRMYXQgKyBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQpKVxuICAgICAgICAgICAgICAgICAgICApPyB0aGlzLnNldHRpbmdzLmluaXRMYXQgOiB0aGlzLmxhdCArIHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCAqIHN5bWJvbExhdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5iYWNrVG9Ib3Jpem9uQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA+ICh0aGlzLnNldHRpbmdzLmluaXRMb24gLSBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24pKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPCAodGhpcy5zZXR0aW5ncy5pbml0TG9uICsgTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uKSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5zZXR0aW5ncy5pbml0TG9uIDogdGhpcy5sb24gKyB0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24gKiBzeW1ib2xMb247XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5sYXQgPSBNYXRoLm1heCggdGhpcy5zZXR0aW5ncy5taW5MYXQsIE1hdGgubWluKCB0aGlzLnNldHRpbmdzLm1heExhdCwgdGhpcy5sYXQgKSApO1xuICAgICAgICAgICAgdGhpcy5sb24gPSBNYXRoLm1heCggdGhpcy5zZXR0aW5ncy5taW5Mb24sIE1hdGgubWluKCB0aGlzLnNldHRpbmdzLm1heExvbiwgdGhpcy5sb24gKSApO1xuICAgICAgICAgICAgdGhpcy5waGkgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCA5MCAtIHRoaXMubGF0ICk7XG4gICAgICAgICAgICB0aGlzLnRoZXRhID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggdGhpcy5sb24gKTtcblxuICAgICAgICAgICAgaWYoIXRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oZWxwZXJDYW52YXMudXBkYXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmNsZWFyKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGxheU9uTW9iaWxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmlzUGxheU9uTW9iaWxlID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYXV0b01vYmlsZU9yaWVudGF0aW9uKVxuICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2Vtb3Rpb24nLCB0aGlzLmhhbmRsZU1vYmlsZU9yaWVudGF0aW9uLmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZWxfO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgQmFzZUNhbnZhcztcbiIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxuICovXG5cbmltcG9ydCBCYXNlQ2FudmFzIGZyb20gJy4vQmFzZUNhbnZhcyc7XG5pbXBvcnQgVXRpbCBmcm9tICcuL1V0aWwnO1xuXG52YXIgQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIFRIUkVFLCBzZXR0aW5ncyA9IHt9KSB7XG4gICAgdmFyIHBhcmVudCA9IEJhc2VDYW52YXMoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzKTtcblxuICAgIHJldHVybiBVdGlsLmV4dGVuZChwYXJlbnQsIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHBhcmVudC5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHRoaXMuVlJNb2RlID0gZmFsc2U7XG4gICAgICAgICAgICAvL2RlZmluZSBzY2VuZVxuICAgICAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuICAgICAgICAgICAgLy9kZWZpbmUgY2FtZXJhXG4gICAgICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShvcHRpb25zLmluaXRGb3YsIHRoaXMud2lkdGggLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQgPSBuZXcgVEhSRUUuVmVjdG9yMyggMCwgMCwgMCApO1xuXG4gICAgICAgICAgICAvL2RlZmluZSBnZW9tZXRyeVxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5ID0gKHRoaXMudmlkZW9UeXBlID09PSBcImVxdWlyZWN0YW5ndWxhclwiKT8gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDUwMCwgNjAsIDQwKTogbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KCA1MDAsIDYwLCA0MCApLnRvTm9uSW5kZXhlZCgpO1xuICAgICAgICAgICAgaWYodGhpcy52aWRlb1R5cGUgPT09IFwiZmlzaGV5ZVwiKXtcbiAgICAgICAgICAgICAgICB2YXIgbm9ybWFscyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgICAgIHZhciB1dnMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgICAgIGZvciAoIHZhciBpID0gMCwgbCA9IG5vcm1hbHMubGVuZ3RoIC8gMzsgaSA8IGw7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB4ID0gbm9ybWFsc1sgaSAqIDMgKyAwIF07XG4gICAgICAgICAgICAgICAgICAgIHZhciB5ID0gbm9ybWFsc1sgaSAqIDMgKyAxIF07XG4gICAgICAgICAgICAgICAgICAgIHZhciB6ID0gbm9ybWFsc1sgaSAqIDMgKyAyIF07XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHIgPSBNYXRoLmFzaW4oTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopIC8gTWF0aC5zcXJ0KHggKiB4ICArIHkgKiB5ICsgeiAqIHopKSAvIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHkgPCAwKSByID0gMSAtIHI7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YSA9ICh4ID09IDAgJiYgeiA9PSAwKT8gMCA6IE1hdGguYWNvcyh4IC8gTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopKTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeiA8IDApIHRoZXRhID0gdGhldGEgKiAtMTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDAgXSA9IC0wLjggKiByICogTWF0aC5jb3ModGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMSBdID0gMC44ICogciAqIE1hdGguc2luKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWCggb3B0aW9ucy5yb3RhdGVYKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVZKCBvcHRpb25zLnJvdGF0ZVkpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVooIG9wdGlvbnMucm90YXRlWik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnZW9tZXRyeS5zY2FsZSggLSAxLCAxLCAxICk7XG4gICAgICAgICAgICAvL2RlZmluZSBtZXNoXG4gICAgICAgICAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy90aGlzLm1lc2guc2NhbGUueCA9IC0xO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoKTtcblxuICAgICAgICAgICAgaWYob3B0aW9ucy5jYWxsYmFjaykgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVuYWJsZVZSOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IHRydWU7XG4gICAgICAgICAgICBpZih0eXBlb2YgdnJITUQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgICAgICAgICB2YXIgZXllUGFyYW1zTCA9IHZySE1ELmdldEV5ZVBhcmFtZXRlcnMoICdsZWZ0JyApO1xuICAgICAgICAgICAgICAgIHZhciBleWVQYXJhbXNSID0gdnJITUQuZ2V0RXllUGFyYW1ldGVycyggJ3JpZ2h0JyApO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5leWVGT1ZMID0gZXllUGFyYW1zTC5yZWNvbW1lbmRlZEZpZWxkT2ZWaWV3O1xuICAgICAgICAgICAgICAgIHRoaXMuZXllRk9WUiA9IGV5ZVBhcmFtc1IucmVjb21tZW5kZWRGaWVsZE9mVmlldztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKHRoaXMuY2FtZXJhLmZvdiwgdGhpcy53aWR0aCAvMiAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUiA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSh0aGlzLmNhbWVyYS5mb3YsIHRoaXMud2lkdGggLzIgLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZGlzYWJsZVZSOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLlZSTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3NvciggMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQgKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHBhcmVudC5oYW5kbGVSZXNpemUuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIGlmKHRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZU1vdXNlV2hlZWwoZXZlbnQpO1xuICAgICAgICAgICAgLy8gV2ViS2l0XG4gICAgICAgICAgICBpZiAoIGV2ZW50LndoZWVsRGVsdGFZICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBGaXJlZm94XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC5kZXRhaWwgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ICs9IGV2ZW50LmRldGFpbCAqIDEuMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5tYXgodGhpcy5zZXR0aW5ncy5taW5Gb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICBpZih0aGlzLlZSTW9kZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IHRoaXMuY2FtZXJhLmZvdjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuZm92ID0gdGhpcy5jYW1lcmEuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBwYXJlbnQucmVuZGVyLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC55ID0gNTAwICogTWF0aC5jb3MoIHRoaXMucGhpICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmxvb2tBdCggdGhpcy5jYW1lcmEudGFyZ2V0ICk7XG5cbiAgICAgICAgICAgIGlmKCF0aGlzLlZSTW9kZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgIHZhciB2aWV3UG9ydFdpZHRoID0gdGhpcy53aWR0aCAvIDIsIHZpZXdQb3J0SGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIHZySE1EICE9PSAndW5kZWZpbmVkJyl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5wcm9qZWN0aW9uTWF0cml4ID0gVXRpbC5mb3ZUb1Byb2plY3Rpb24oIHRoaXMuZXllRk9WTCwgdHJ1ZSwgdGhpcy5jYW1lcmEubmVhciwgdGhpcy5jYW1lcmEuZmFyICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5wcm9qZWN0aW9uTWF0cml4ID0gVXRpbC5mb3ZUb1Byb2plY3Rpb24oIHRoaXMuZXllRk9WUiwgdHJ1ZSwgdGhpcy5jYW1lcmEubmVhciwgdGhpcy5jYW1lcmEuZmFyICk7XG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb25MID0gdGhpcy5sb24gKyB0aGlzLnNldHRpbmdzLlZSR2FwRGVncmVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbG9uUiA9IHRoaXMubG9uIC0gdGhpcy5zZXR0aW5ncy5WUkdhcERlZ3JlZTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgdGhldGFMID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggbG9uTCApO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGhldGFSID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggbG9uUiApO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0YXJnZXRMID0gVXRpbC5kZWVwQ29weSh0aGlzLmNhbWVyYS50YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMLnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGV0YUwgKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0TC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhldGFMICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5sb29rQXQodGFyZ2V0TCk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldFIgPSBVdGlsLmRlZXBDb3B5KHRoaXMuY2FtZXJhLnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFIueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoZXRhUiApO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRSLnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGV0YVIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmxvb2tBdCh0YXJnZXRSKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIGxlZnQgZXllXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhTCApO1xuXG4gICAgICAgICAgICAgICAgLy8gcmVuZGVyIHJpZ2h0IGV5ZVxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIHZpZXdQb3J0V2lkdGgsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYVIgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgQ2FudmFzO1xuIiwiLyoqXG4gKiBAYXV0aG9yIGFsdGVyZWRxIC8gaHR0cDovL2FsdGVyZWRxdWFsaWEuY29tL1xuICogQGF1dGhvciBtci5kb29iIC8gaHR0cDovL21yZG9vYi5jb20vXG4gKi9cblxudmFyIERldGVjdG9yID0ge1xuXG4gICAgY2FudmFzOiAhISB3aW5kb3cuQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuICAgIHdlYmdsOiAoIGZ1bmN0aW9uICgpIHtcblxuICAgICAgICB0cnkge1xuXG4gICAgICAgICAgICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggJ2NhbnZhcycgKTsgcmV0dXJuICEhICggd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCAmJiAoIGNhbnZhcy5nZXRDb250ZXh0KCAnd2ViZ2wnICkgfHwgY2FudmFzLmdldENvbnRleHQoICdleHBlcmltZW50YWwtd2ViZ2wnICkgKSApO1xuXG4gICAgICAgIH0gY2F0Y2ggKCBlICkge1xuXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgfVxuXG4gICAgfSApKCksXG4gICAgd29ya2VyczogISEgd2luZG93LldvcmtlcixcbiAgICBmaWxlYXBpOiB3aW5kb3cuRmlsZSAmJiB3aW5kb3cuRmlsZVJlYWRlciAmJiB3aW5kb3cuRmlsZUxpc3QgJiYgd2luZG93LkJsb2IsXG5cbiAgICAgQ2hlY2tfVmVyc2lvbjogZnVuY3Rpb24oKSB7XG4gICAgICAgICB2YXIgcnYgPSAtMTsgLy8gUmV0dXJuIHZhbHVlIGFzc3VtZXMgZmFpbHVyZS5cblxuICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBOYW1lID09ICdNaWNyb3NvZnQgSW50ZXJuZXQgRXhwbG9yZXInKSB7XG5cbiAgICAgICAgICAgICB2YXIgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50LFxuICAgICAgICAgICAgICAgICByZSA9IG5ldyBSZWdFeHAoXCJNU0lFIChbMC05XXsxLH1bXFxcXC4wLTldezAsfSlcIik7XG5cbiAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgcnYgPSBwYXJzZUZsb2F0KFJlZ0V4cC4kMSk7XG4gICAgICAgICAgICAgfVxuICAgICAgICAgfVxuICAgICAgICAgZWxzZSBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gXCJOZXRzY2FwZVwiKSB7XG4gICAgICAgICAgICAgLy8vIGluIElFIDExIHRoZSBuYXZpZ2F0b3IuYXBwVmVyc2lvbiBzYXlzICd0cmlkZW50J1xuICAgICAgICAgICAgIC8vLyBpbiBFZGdlIHRoZSBuYXZpZ2F0b3IuYXBwVmVyc2lvbiBkb2VzIG5vdCBzYXkgdHJpZGVudFxuICAgICAgICAgICAgIGlmIChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKCdUcmlkZW50JykgIT09IC0xKSBydiA9IDExO1xuICAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgIHZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQ7XG4gICAgICAgICAgICAgICAgIHZhciByZSA9IG5ldyBSZWdFeHAoXCJFZGdlXFwvKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcbiAgICAgICAgICAgICAgICAgaWYgKHJlLmV4ZWModWEpICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICBydiA9IHBhcnNlRmxvYXQoUmVnRXhwLiQxKTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgIH1cblxuICAgICAgICAgcmV0dXJuIHJ2O1xuICAgICB9LFxuXG4gICAgc3VwcG9ydFZpZGVvVGV4dHVyZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAvL2llIDExIGFuZCBlZGdlIDEyIGRvZXNuJ3Qgc3VwcG9ydCB2aWRlbyB0ZXh0dXJlLlxuICAgICAgICB2YXIgdmVyc2lvbiA9IHRoaXMuQ2hlY2tfVmVyc2lvbigpO1xuICAgICAgICByZXR1cm4gKHZlcnNpb24gPT09IC0xIHx8IHZlcnNpb24gPj0gMTMpO1xuICAgIH0sXG5cbiAgICBnZXRXZWJHTEVycm9yTWVzc2FnZTogZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggJ2RpdicgKTtcbiAgICAgICAgZWxlbWVudC5pZCA9ICd3ZWJnbC1lcnJvci1tZXNzYWdlJztcblxuICAgICAgICBpZiAoICEgdGhpcy53ZWJnbCApIHtcblxuICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgPSB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0ID8gW1xuICAgICAgICAgICAgICAgICdZb3VyIGdyYXBoaWNzIGNhcmQgZG9lcyBub3Qgc2VlbSB0byBzdXBwb3J0IDxhIGhyZWY9XCJodHRwOi8va2hyb25vcy5vcmcvd2ViZ2wvd2lraS9HZXR0aW5nX2FfV2ViR0xfSW1wbGVtZW50YXRpb25cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5XZWJHTDwvYT4uPGJyIC8+JyxcbiAgICAgICAgICAgICAgICAnRmluZCBvdXQgaG93IHRvIGdldCBpdCA8YSBocmVmPVwiaHR0cDovL2dldC53ZWJnbC5vcmcvXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+aGVyZTwvYT4uJ1xuICAgICAgICAgICAgXS5qb2luKCAnXFxuJyApIDogW1xuICAgICAgICAgICAgICAgICdZb3VyIGJyb3dzZXIgZG9lcyBub3Qgc2VlbSB0byBzdXBwb3J0IDxhIGhyZWY9XCJodHRwOi8va2hyb25vcy5vcmcvd2ViZ2wvd2lraS9HZXR0aW5nX2FfV2ViR0xfSW1wbGVtZW50YXRpb25cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5XZWJHTDwvYT4uPGJyLz4nLFxuICAgICAgICAgICAgICAgICdGaW5kIG91dCBob3cgdG8gZ2V0IGl0IDxhIGhyZWY9XCJodHRwOi8vZ2V0LndlYmdsLm9yZy9cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5oZXJlPC9hPi4nXG4gICAgICAgICAgICBdLmpvaW4oICdcXG4nICk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBlbGVtZW50O1xuXG4gICAgfSxcblxuICAgIGFkZEdldFdlYkdMTWVzc2FnZTogZnVuY3Rpb24gKCBwYXJhbWV0ZXJzICkge1xuXG4gICAgICAgIHZhciBwYXJlbnQsIGlkLCBlbGVtZW50O1xuXG4gICAgICAgIHBhcmFtZXRlcnMgPSBwYXJhbWV0ZXJzIHx8IHt9O1xuXG4gICAgICAgIHBhcmVudCA9IHBhcmFtZXRlcnMucGFyZW50ICE9PSB1bmRlZmluZWQgPyBwYXJhbWV0ZXJzLnBhcmVudCA6IGRvY3VtZW50LmJvZHk7XG4gICAgICAgIGlkID0gcGFyYW1ldGVycy5pZCAhPT0gdW5kZWZpbmVkID8gcGFyYW1ldGVycy5pZCA6ICdvbGRpZSc7XG5cbiAgICAgICAgZWxlbWVudCA9IERldGVjdG9yLmdldFdlYkdMRXJyb3JNZXNzYWdlKCk7XG4gICAgICAgIGVsZW1lbnQuaWQgPSBpZDtcblxuICAgICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoIGVsZW1lbnQgKTtcblxuICAgIH1cblxufTtcblxuZXhwb3J0IGRlZmF1bHQgRGV0ZWN0b3I7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA1LzIzLzE2LlxuICovXG52YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1oZWxwZXItY2FudmFzXCI7XG5cbnZhciBIZWxwZXJDYW52YXMgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgdGhpcy52aWRlb0VsZW1lbnQgPSBvcHRpb25zLnZpZGVvO1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IG9wdGlvbnMud2lkdGg7XG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0O1xuXG4gICAgICAgICAgICBlbGVtZW50LndpZHRoID0gdGhpcy53aWR0aDtcbiAgICAgICAgICAgIGVsZW1lbnQuaGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICBlbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBlbGVtZW50O1xuXG5cbiAgICAgICAgICAgIHRoaXMuY29udGV4dCA9IGVsZW1lbnQuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5kcmF3SW1hZ2UodGhpcy52aWRlb0VsZW1lbnQsIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgZ2V0Q29udGV4dDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQ7ICBcbiAgICAgICAgfSxcbiAgICAgICAgXG4gICAgICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IEhlbHBlckNhbnZhczsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDYvNi8xNi5cbiAqL1xudmFyIE1vYmlsZUJ1ZmZlcmluZyA9IHtcbiAgICBwcmV2X2N1cnJlbnRUaW1lOiAwLFxuICAgIGNvdW50ZXI6IDAsXG4gICAgXG4gICAgaXNCdWZmZXJpbmc6IGZ1bmN0aW9uIChjdXJyZW50VGltZSkge1xuICAgICAgICBpZiAoY3VycmVudFRpbWUgPT0gdGhpcy5wcmV2X2N1cnJlbnRUaW1lKSB0aGlzLmNvdW50ZXIrKztcbiAgICAgICAgZWxzZSB0aGlzLmNvdW50ZXIgPSAwO1xuICAgICAgICB0aGlzLnByZXZfY3VycmVudFRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgICAgaWYodGhpcy5jb3VudGVyID4gMTApe1xuICAgICAgICAgICAgLy9ub3QgbGV0IGNvdW50ZXIgb3ZlcmZsb3dcbiAgICAgICAgICAgIHRoaXMuY291bnRlciA9IDEwO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IE1vYmlsZUJ1ZmZlcmluZzsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvNC8xNi5cbiAqL1xuXG52YXIgTm90aWNlID0gZnVuY3Rpb24oYmFzZUNvbXBvbmVudCl7XG4gICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLW5vdGljZS1sYWJlbFwiO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJvYmplY3RcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgfWVsc2UgaWYodHlwZW9mIG9wdGlvbnMuTm90aWNlTWVzc2FnZSA9PSBcInN0cmluZ1wiKXtcbiAgICAgICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gZWxlbWVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgTm90aWNlOyIsIi8qKlxuICpcbiAqIChjKSBXZW5zaGVuZyBZYW4gPHlhbndzaEBnbWFpbC5jb20+XG4gKiBEYXRlOiAxMC8yMS8xNlxuICpcbiAqIEZvciB0aGUgZnVsbCBjb3B5cmlnaHQgYW5kIGxpY2Vuc2UgaW5mb3JtYXRpb24sIHBsZWFzZSB2aWV3IHRoZSBMSUNFTlNFXG4gKiBmaWxlIHRoYXQgd2FzIGRpc3RyaWJ1dGVkIHdpdGggdGhpcyBzb3VyY2UgY29kZS5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgQmFzZUNhbnZhcyBmcm9tICcuL0Jhc2VDYW52YXMnO1xuaW1wb3J0IFV0aWwgZnJvbSAnLi9VdGlsJztcblxudmFyIFRocmVlRENhbnZhcyA9IGZ1bmN0aW9uIChiYXNlQ29tcG9uZW50LCBUSFJFRSwgc2V0dGluZ3MgPSB7fSl7XG4gICAgdmFyIHBhcmVudCA9IEJhc2VDYW52YXMoYmFzZUNvbXBvbmVudCwgVEhSRUUsIHNldHRpbmdzKTtcbiAgICByZXR1cm4gVXRpbC5leHRlbmQocGFyZW50LCB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBwYXJlbnQuY29uc3RydWN0b3IuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAvL2RlZmluZSBzY2VuZVxuICAgICAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuICAgICAgICAgICAgdmFyIGFzcGVjdFJhdGlvID0gdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0IC8gMjtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmFMID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgYXNwZWN0UmF0aW8sIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAwLCAwLCAwICk7XG5cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUiA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShvcHRpb25zLmluaXRGb3YsIGFzcGVjdFJhdGlvLCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5wb3NpdGlvbi5zZXQoIDEwMDAsIDAsIDAgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi50YXJnZXQgPSBuZXcgVEhSRUUuVmVjdG9yMyggMTAwMCwgMCwgMCApO1xuXG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnlMID0gbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KDUwMCwgNjAsIDQwKS50b05vbkluZGV4ZWQoKTtcbiAgICAgICAgICAgIHZhciBnZW9tZXRyeVIgPSBuZXcgVEhSRUUuU3BoZXJlQnVmZmVyR2VvbWV0cnkoNTAwLCA2MCwgNDApLnRvTm9uSW5kZXhlZCgpO1xuXG4gICAgICAgICAgICB2YXIgdXZzTCA9IGdlb21ldHJ5TC5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgdmFyIG5vcm1hbHNMID0gZ2VvbWV0cnlMLmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgZm9yICggdmFyIGkgPSAwOyBpIDwgbm9ybWFsc0wubGVuZ3RoIC8gMzsgaSArKyApIHtcbiAgICAgICAgICAgICAgICB1dnNMWyBpICogMiArIDEgXSA9IHV2c0xbIGkgKiAyICsgMSBdIC8gMjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHV2c1IgPSBnZW9tZXRyeVIuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgIHZhciBub3JtYWxzUiA9IGdlb21ldHJ5Ui5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IG5vcm1hbHNSLmxlbmd0aCAvIDM7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgdXZzUlsgaSAqIDIgKyAxIF0gPSB1dnNSWyBpICogMiArIDEgXSAvIDIgKyAwLjU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGdlb21ldHJ5TC5zY2FsZSggLSAxLCAxLCAxICk7XG4gICAgICAgICAgICBnZW9tZXRyeVIuc2NhbGUoIC0gMSwgMSwgMSApO1xuXG4gICAgICAgICAgICB0aGlzLm1lc2hMID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnlMLFxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIHRoaXMubWVzaFIgPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeVIsXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0aGlzLnRleHR1cmV9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRoaXMubWVzaFIucG9zaXRpb24uc2V0KDEwMDAsIDAsIDApO1xuXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLm1lc2hMKTtcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMubWVzaFIpO1xuXG4gICAgICAgICAgICBpZihvcHRpb25zLmNhbGxiYWNrKSBvcHRpb25zLmNhbGxiYWNrKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlUmVzaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBwYXJlbnQuaGFuZGxlUmVzaXplLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB2YXIgYXNwZWN0UmF0aW8gPSB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQgLyAyO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmFzcGVjdCA9IGFzcGVjdFJhdGlvO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmFzcGVjdCA9IGFzcGVjdFJhdGlvO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgcGFyZW50LmhhbmRsZU1vdXNlV2hlZWwoZXZlbnQpO1xuICAgICAgICAgICAgLy8gV2ViS2l0XG4gICAgICAgICAgICBpZiAoIGV2ZW50LndoZWVsRGVsdGFZICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YVkgKiAwLjA1O1xuICAgICAgICAgICAgICAgIC8vIE9wZXJhIC8gRXhwbG9yZXIgOVxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQud2hlZWxEZWx0YSApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuZm92IC09IGV2ZW50LndoZWVsRGVsdGEgKiAwLjA1O1xuICAgICAgICAgICAgICAgIC8vIEZpcmVmb3hcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGV2ZW50LmRldGFpbCApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuZm92ICs9IGV2ZW50LmRldGFpbCAqIDEuMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5mb3YgPSBNYXRoLm1pbih0aGlzLnNldHRpbmdzLm1heEZvdiwgdGhpcy5jYW1lcmFMLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwuZm92ID0gTWF0aC5tYXgodGhpcy5zZXR0aW5ncy5taW5Gb3YsIHRoaXMuY2FtZXJhTC5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLmZvdiA9IHRoaXMuY2FtZXJhTC5mb3Y7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBwYXJlbnQucmVuZGVyLmNhbGwodGhpcyk7XG4gICAgICAgICAgICB2YXIgdmlld1BvcnRXaWR0aCA9IHRoaXMud2lkdGggLyAyLCB2aWV3UG9ydEhlaWdodCA9IHRoaXMuaGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnRhcmdldC54ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnRhcmdldC55ID0gNTAwICogTWF0aC5jb3MoIHRoaXMucGhpICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwudGFyZ2V0LnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYUwubG9va0F0KHRoaXMuY2FtZXJhTC50YXJnZXQpO1xuXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0LnggPSAxMDAwICsgNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLmNvcyggdGhpcy50aGV0YSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnRhcmdldC55ID0gNTAwICogTWF0aC5jb3MoIHRoaXMucGhpICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIudGFyZ2V0LnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIubG9va0F0KCB0aGlzLmNhbWVyYVIudGFyZ2V0ICk7XG5cbiAgICAgICAgICAgIC8vIHJlbmRlciBsZWZ0IGV5ZVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3NvciggMCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYUwgKTtcblxuICAgICAgICAgICAgLy8gcmVuZGVyIHJpZ2h0IGV5ZVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRWaWV3cG9ydCggdmlld1BvcnRXaWR0aCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3Nvciggdmlld1BvcnRXaWR0aCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYVIgKTtcbiAgICAgICAgfVxuICAgIH0pO1xufTtcblxuZXhwb3J0IGRlZmF1bHQgVGhyZWVEQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB3ZW5zaGVuZy55YW4gb24gNC80LzE2LlxuICovXG5mdW5jdGlvbiB3aGljaFRyYW5zaXRpb25FdmVudCgpe1xuICAgIHZhciB0O1xuICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zha2VlbGVtZW50Jyk7XG4gICAgdmFyIHRyYW5zaXRpb25zID0ge1xuICAgICAgICAndHJhbnNpdGlvbic6J3RyYW5zaXRpb25lbmQnLFxuICAgICAgICAnT1RyYW5zaXRpb24nOidvVHJhbnNpdGlvbkVuZCcsXG4gICAgICAgICdNb3pUcmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdXZWJraXRUcmFuc2l0aW9uJzond2Via2l0VHJhbnNpdGlvbkVuZCdcbiAgICB9O1xuXG4gICAgZm9yKHQgaW4gdHJhbnNpdGlvbnMpe1xuICAgICAgICBpZiggZWwuc3R5bGVbdF0gIT09IHVuZGVmaW5lZCApe1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zaXRpb25zW3RdO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtb2JpbGVBbmRUYWJsZXRjaGVjaygpIHtcbiAgICB2YXIgY2hlY2sgPSBmYWxzZTtcbiAgICAoZnVuY3Rpb24oYSl7aWYoLyhhbmRyb2lkfGJiXFxkK3xtZWVnbykuK21vYmlsZXxhdmFudGdvfGJhZGFcXC98YmxhY2tiZXJyeXxibGF6ZXJ8Y29tcGFsfGVsYWluZXxmZW5uZWN8aGlwdG9wfGllbW9iaWxlfGlwKGhvbmV8b2QpfGlyaXN8a2luZGxlfGxnZSB8bWFlbW98bWlkcHxtbXB8bW9iaWxlLitmaXJlZm94fG5ldGZyb250fG9wZXJhIG0ob2J8aW4paXxwYWxtKCBvcyk/fHBob25lfHAoaXhpfHJlKVxcL3xwbHVja2VyfHBvY2tldHxwc3B8c2VyaWVzKDR8NikwfHN5bWJpYW58dHJlb3x1cFxcLihicm93c2VyfGxpbmspfHZvZGFmb25lfHdhcHx3aW5kb3dzIGNlfHhkYXx4aWlub3xhbmRyb2lkfGlwYWR8cGxheWJvb2t8c2lsay9pLnRlc3QoYSl8fC8xMjA3fDYzMTB8NjU5MHwzZ3NvfDR0aHB8NTBbMS02XWl8Nzcwc3w4MDJzfGEgd2F8YWJhY3xhYyhlcnxvb3xzXFwtKXxhaShrb3xybil8YWwoYXZ8Y2F8Y28pfGFtb2l8YW4oZXh8bnl8eXcpfGFwdHV8YXIoY2h8Z28pfGFzKHRlfHVzKXxhdHR3fGF1KGRpfFxcLW18ciB8cyApfGF2YW58YmUoY2t8bGx8bnEpfGJpKGxifHJkKXxibChhY3xheil8YnIoZXx2KXd8YnVtYnxid1xcLShufHUpfGM1NVxcL3xjYXBpfGNjd2F8Y2RtXFwtfGNlbGx8Y2h0bXxjbGRjfGNtZFxcLXxjbyhtcHxuZCl8Y3Jhd3xkYShpdHxsbHxuZyl8ZGJ0ZXxkY1xcLXN8ZGV2aXxkaWNhfGRtb2J8ZG8oY3xwKW98ZHMoMTJ8XFwtZCl8ZWwoNDl8YWkpfGVtKGwyfHVsKXxlcihpY3xrMCl8ZXNsOHxleihbNC03XTB8b3N8d2F8emUpfGZldGN8Zmx5KFxcLXxfKXxnMSB1fGc1NjB8Z2VuZXxnZlxcLTV8Z1xcLW1vfGdvKFxcLnd8b2QpfGdyKGFkfHVuKXxoYWllfGhjaXR8aGRcXC0obXxwfHQpfGhlaVxcLXxoaShwdHx0YSl8aHAoIGl8aXApfGhzXFwtY3xodChjKFxcLXwgfF98YXxnfHB8c3x0KXx0cCl8aHUoYXd8dGMpfGlcXC0oMjB8Z298bWEpfGkyMzB8aWFjKCB8XFwtfFxcLyl8aWJyb3xpZGVhfGlnMDF8aWtvbXxpbTFrfGlubm98aXBhcXxpcmlzfGphKHR8dilhfGpicm98amVtdXxqaWdzfGtkZGl8a2VqaXxrZ3QoIHxcXC8pfGtsb258a3B0IHxrd2NcXC18a3lvKGN8ayl8bGUobm98eGkpfGxnKCBnfFxcLyhrfGx8dSl8NTB8NTR8XFwtW2Etd10pfGxpYnd8bHlueHxtMVxcLXd8bTNnYXxtNTBcXC98bWEodGV8dWl8eG8pfG1jKDAxfDIxfGNhKXxtXFwtY3J8bWUocmN8cmkpfG1pKG84fG9hfHRzKXxtbWVmfG1vKDAxfDAyfGJpfGRlfGRvfHQoXFwtfCB8b3x2KXx6eil8bXQoNTB8cDF8diApfG13YnB8bXl3YXxuMTBbMC0yXXxuMjBbMi0zXXxuMzAoMHwyKXxuNTAoMHwyfDUpfG43KDAoMHwxKXwxMCl8bmUoKGN8bSlcXC18b258dGZ8d2Z8d2d8d3QpfG5vayg2fGkpfG56cGh8bzJpbXxvcCh0aXx3dil8b3Jhbnxvd2cxfHA4MDB8cGFuKGF8ZHx0KXxwZHhnfHBnKDEzfFxcLShbMS04XXxjKSl8cGhpbHxwaXJlfHBsKGF5fHVjKXxwblxcLTJ8cG8oY2t8cnR8c2UpfHByb3h8cHNpb3xwdFxcLWd8cWFcXC1hfHFjKDA3fDEyfDIxfDMyfDYwfFxcLVsyLTddfGlcXC0pfHF0ZWt8cjM4MHxyNjAwfHJha3N8cmltOXxybyh2ZXx6byl8czU1XFwvfHNhKGdlfG1hfG1tfG1zfG55fHZhKXxzYygwMXxoXFwtfG9vfHBcXC0pfHNka1xcL3xzZShjKFxcLXwwfDEpfDQ3fG1jfG5kfHJpKXxzZ2hcXC18c2hhcnxzaWUoXFwtfG0pfHNrXFwtMHxzbCg0NXxpZCl8c20oYWx8YXJ8YjN8aXR8dDUpfHNvKGZ0fG55KXxzcCgwMXxoXFwtfHZcXC18diApfHN5KDAxfG1iKXx0MigxOHw1MCl8dDYoMDB8MTB8MTgpfHRhKGd0fGxrKXx0Y2xcXC18dGRnXFwtfHRlbChpfG0pfHRpbVxcLXx0XFwtbW98dG8ocGx8c2gpfHRzKDcwfG1cXC18bTN8bTUpfHR4XFwtOXx1cChcXC5ifGcxfHNpKXx1dHN0fHY0MDB8djc1MHx2ZXJpfHZpKHJnfHRlKXx2ayg0MHw1WzAtM118XFwtdil8dm00MHx2b2RhfHZ1bGN8dngoNTJ8NTN8NjB8NjF8NzB8ODB8ODF8ODN8ODV8OTgpfHczYyhcXC18ICl8d2ViY3x3aGl0fHdpKGcgfG5jfG53KXx3bWxifHdvbnV8eDcwMHx5YXNcXC18eW91cnx6ZXRvfHp0ZVxcLS9pLnRlc3QoYS5zdWJzdHIoMCw0KSkpY2hlY2sgPSB0cnVlfSkobmF2aWdhdG9yLnVzZXJBZ2VudHx8bmF2aWdhdG9yLnZlbmRvcnx8d2luZG93Lm9wZXJhKTtcbiAgICByZXR1cm4gY2hlY2s7XG59XG5cbmZ1bmN0aW9uIGlzSW9zKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQYWR8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG59XG5cbmZ1bmN0aW9uIGlzUmVhbElwaG9uZSgpIHtcbiAgICByZXR1cm4gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pO1xufVxuXG4vL2Fkb3B0IGNvZGUgZnJvbTogaHR0cHM6Ly9naXRodWIuY29tL01velZSL3ZyLXdlYi1leGFtcGxlcy9ibG9iL21hc3Rlci90aHJlZWpzLXZyLWJvaWxlcnBsYXRlL2pzL1ZSRWZmZWN0LmpzXG5mdW5jdGlvbiBmb3ZUb05EQ1NjYWxlT2Zmc2V0KCBmb3YgKSB7XG4gICAgdmFyIHB4c2NhbGUgPSAyLjAgLyAoZm92LmxlZnRUYW4gKyBmb3YucmlnaHRUYW4pO1xuICAgIHZhciBweG9mZnNldCA9IChmb3YubGVmdFRhbiAtIGZvdi5yaWdodFRhbikgKiBweHNjYWxlICogMC41O1xuICAgIHZhciBweXNjYWxlID0gMi4wIC8gKGZvdi51cFRhbiArIGZvdi5kb3duVGFuKTtcbiAgICB2YXIgcHlvZmZzZXQgPSAoZm92LnVwVGFuIC0gZm92LmRvd25UYW4pICogcHlzY2FsZSAqIDAuNTtcbiAgICByZXR1cm4geyBzY2FsZTogWyBweHNjYWxlLCBweXNjYWxlIF0sIG9mZnNldDogWyBweG9mZnNldCwgcHlvZmZzZXQgXSB9O1xufVxuXG5mdW5jdGlvbiBmb3ZQb3J0VG9Qcm9qZWN0aW9uKCBmb3YsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApIHtcblxuICAgIHJpZ2h0SGFuZGVkID0gcmlnaHRIYW5kZWQgPT09IHVuZGVmaW5lZCA/IHRydWUgOiByaWdodEhhbmRlZDtcbiAgICB6TmVhciA9IHpOZWFyID09PSB1bmRlZmluZWQgPyAwLjAxIDogek5lYXI7XG4gICAgekZhciA9IHpGYXIgPT09IHVuZGVmaW5lZCA/IDEwMDAwLjAgOiB6RmFyO1xuXG4gICAgdmFyIGhhbmRlZG5lc3NTY2FsZSA9IHJpZ2h0SGFuZGVkID8gLTEuMCA6IDEuMDtcblxuICAgIC8vIHN0YXJ0IHdpdGggYW4gaWRlbnRpdHkgbWF0cml4XG4gICAgdmFyIG1vYmogPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICAgIHZhciBtID0gbW9iai5lbGVtZW50cztcblxuICAgIC8vIGFuZCB3aXRoIHNjYWxlL29mZnNldCBpbmZvIGZvciBub3JtYWxpemVkIGRldmljZSBjb29yZHNcbiAgICB2YXIgc2NhbGVBbmRPZmZzZXQgPSBmb3ZUb05EQ1NjYWxlT2Zmc2V0KGZvdik7XG5cbiAgICAvLyBYIHJlc3VsdCwgbWFwIGNsaXAgZWRnZXMgdG8gWy13LCt3XVxuICAgIG1bMCAqIDQgKyAwXSA9IHNjYWxlQW5kT2Zmc2V0LnNjYWxlWzBdO1xuICAgIG1bMCAqIDQgKyAxXSA9IDAuMDtcbiAgICBtWzAgKiA0ICsgMl0gPSBzY2FsZUFuZE9mZnNldC5vZmZzZXRbMF0gKiBoYW5kZWRuZXNzU2NhbGU7XG4gICAgbVswICogNCArIDNdID0gMC4wO1xuXG4gICAgLy8gWSByZXN1bHQsIG1hcCBjbGlwIGVkZ2VzIHRvIFstdywrd11cbiAgICAvLyBZIG9mZnNldCBpcyBuZWdhdGVkIGJlY2F1c2UgdGhpcyBwcm9qIG1hdHJpeCB0cmFuc2Zvcm1zIGZyb20gd29ybGQgY29vcmRzIHdpdGggWT11cCxcbiAgICAvLyBidXQgdGhlIE5EQyBzY2FsaW5nIGhhcyBZPWRvd24gKHRoYW5rcyBEM0Q/KVxuICAgIG1bMSAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzEgKiA0ICsgMV0gPSBzY2FsZUFuZE9mZnNldC5zY2FsZVsxXTtcbiAgICBtWzEgKiA0ICsgMl0gPSAtc2NhbGVBbmRPZmZzZXQub2Zmc2V0WzFdICogaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMSAqIDQgKyAzXSA9IDAuMDtcblxuICAgIC8vIFogcmVzdWx0ICh1cCB0byB0aGUgYXBwKVxuICAgIG1bMiAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzIgKiA0ICsgMV0gPSAwLjA7XG4gICAgbVsyICogNCArIDJdID0gekZhciAvICh6TmVhciAtIHpGYXIpICogLWhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzIgKiA0ICsgM10gPSAoekZhciAqIHpOZWFyKSAvICh6TmVhciAtIHpGYXIpO1xuXG4gICAgLy8gVyByZXN1bHQgKD0gWiBpbilcbiAgICBtWzMgKiA0ICsgMF0gPSAwLjA7XG4gICAgbVszICogNCArIDFdID0gMC4wO1xuICAgIG1bMyAqIDQgKyAyXSA9IGhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzMgKiA0ICsgM10gPSAwLjA7XG5cbiAgICBtb2JqLnRyYW5zcG9zZSgpO1xuXG4gICAgcmV0dXJuIG1vYmo7XG59XG5cbmZ1bmN0aW9uIGZvdlRvUHJvamVjdGlvbiggZm92LCByaWdodEhhbmRlZCwgek5lYXIsIHpGYXIgKSB7XG4gICAgdmFyIERFRzJSQUQgPSBNYXRoLlBJIC8gMTgwLjA7XG5cbiAgICB2YXIgZm92UG9ydCA9IHtcbiAgICAgICAgdXBUYW46IE1hdGgudGFuKCBmb3YudXBEZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICBkb3duVGFuOiBNYXRoLnRhbiggZm92LmRvd25EZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICBsZWZ0VGFuOiBNYXRoLnRhbiggZm92LmxlZnREZWdyZWVzICogREVHMlJBRCApLFxuICAgICAgICByaWdodFRhbjogTWF0aC50YW4oIGZvdi5yaWdodERlZ3JlZXMgKiBERUcyUkFEIClcbiAgICB9O1xuXG4gICAgcmV0dXJuIGZvdlBvcnRUb1Byb2plY3Rpb24oIGZvdlBvcnQsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApO1xufVxuXG5mdW5jdGlvbiBleHRlbmQoc3VwZXJDbGFzcywgc3ViQ2xhc3NNZXRob2RzID0ge30pXG57XG4gICAgZm9yKHZhciBtZXRob2QgaW4gc3VwZXJDbGFzcyl7XG4gICAgICAgIGlmKHN1cGVyQ2xhc3MuaGFzT3duUHJvcGVydHkobWV0aG9kKSAmJiAhc3ViQ2xhc3NNZXRob2RzLmhhc093blByb3BlcnR5KG1ldGhvZCkpe1xuICAgICAgICAgICAgc3ViQ2xhc3NNZXRob2RzW21ldGhvZF0gPSBzdXBlckNsYXNzW21ldGhvZF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1YkNsYXNzTWV0aG9kcztcbn1cblxuZnVuY3Rpb24gZGVlcENvcHkob2JqKSB7XG4gICAgdmFyIHRvID0ge307XG5cbiAgICBmb3IgKHZhciBuYW1lIGluIG9iailcbiAgICB7XG4gICAgICAgIHRvW25hbWVdID0gb2JqW25hbWVdO1xuICAgIH1cblxuICAgIHJldHVybiB0bztcbn1cblxuZXhwb3J0IGRlZmF1bHQge1xuICAgIHdoaWNoVHJhbnNpdGlvbkV2ZW50OiB3aGljaFRyYW5zaXRpb25FdmVudCxcbiAgICBtb2JpbGVBbmRUYWJsZXRjaGVjazogbW9iaWxlQW5kVGFibGV0Y2hlY2ssXG4gICAgaXNJb3M6IGlzSW9zLFxuICAgIGlzUmVhbElwaG9uZTogaXNSZWFsSXBob25lLFxuICAgIGZvdlRvUHJvamVjdGlvbjogZm92VG9Qcm9qZWN0aW9uLFxuICAgIGV4dGVuZDogZXh0ZW5kLFxuICAgIGRlZXBDb3B5OiBkZWVwQ29weVxufTsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDgvMTMvMTYuXG4gKi9cblxudmFyIFZSQnV0dG9uID0gZnVuY3Rpb24oQnV0dG9uQ29tcG9uZW50KXtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgQnV0dG9uQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSxcblxuICAgICAgICBidWlsZENTU0NsYXNzOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBgdmpzLVZSLWNvbnRyb2wgJHtCdXR0b25Db21wb25lbnQucHJvdG90eXBlLmJ1aWxkQ1NTQ2xhc3MuY2FsbCh0aGlzKX1gO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZUNsaWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgY2FudmFzID0gdGhpcy5wbGF5ZXIoKS5nZXRDaGlsZChcIkNhbnZhc1wiKTtcbiAgICAgICAgICAgICghY2FudmFzLlZSTW9kZSk/IGNhbnZhcy5lbmFibGVWUigpIDogY2FudmFzLmRpc2FibGVWUigpO1xuICAgICAgICAgICAgKGNhbnZhcy5WUk1vZGUpPyB0aGlzLmFkZENsYXNzKFwiZW5hYmxlXCIpIDogdGhpcy5yZW1vdmVDbGFzcyhcImVuYWJsZVwiKTtcbiAgICAgICAgICAgIChjYW52YXMuVlJNb2RlKT8gIHRoaXMucGxheWVyKCkudHJpZ2dlcignVlJNb2RlT24nKTogIHRoaXMucGxheWVyKCkudHJpZ2dlcignVlJNb2RlT2ZmJyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY29udHJvbFRleHRfOiBcIlZSXCJcbiAgICB9XG59O1xuXG5leHBvcnQgZGVmYXVsdCBWUkJ1dHRvbjsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgdXRpbCBmcm9tICcuL2xpYi9VdGlsJztcbmltcG9ydCBEZXRlY3RvciBmcm9tICcuL2xpYi9EZXRlY3Rvcic7XG5pbXBvcnQgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUgZnJvbSAnaXBob25lLWlubGluZS12aWRlbyc7XG5cbmNvbnN0IHJ1bk9uTW9iaWxlID0gKHV0aWwubW9iaWxlQW5kVGFibGV0Y2hlY2soKSk7XG5cbi8vIERlZmF1bHQgb3B0aW9ucyBmb3IgdGhlIHBsdWdpbi5cbmNvbnN0IGRlZmF1bHRzID0ge1xuICAgIGNsaWNrQW5kRHJhZzogcnVuT25Nb2JpbGUsXG4gICAgc2hvd05vdGljZTogdHJ1ZSxcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlBsZWFzZSB1c2UgeW91ciBtb3VzZSBkcmFnIGFuZCBkcm9wIHRoZSB2aWRlby5cIixcbiAgICBhdXRvSGlkZU5vdGljZTogMzAwMCxcbiAgICAvL2xpbWl0IHRoZSB2aWRlbyBzaXplIHdoZW4gdXNlciBzY3JvbGwuXG4gICAgc2Nyb2xsYWJsZTogdHJ1ZSxcbiAgICBpbml0Rm92OiA3NSxcbiAgICBtYXhGb3Y6IDEwNSxcbiAgICBtaW5Gb3Y6IDUxLFxuICAgIC8vaW5pdGlhbCBwb3NpdGlvbiBmb3IgdGhlIHZpZGVvXG4gICAgaW5pdExhdDogMCxcbiAgICBpbml0TG9uOiAtMTgwLFxuICAgIC8vQSBmbG9hdCB2YWx1ZSBiYWNrIHRvIGNlbnRlciB3aGVuIG1vdXNlIG91dCB0aGUgY2FudmFzLiBUaGUgaGlnaGVyLCB0aGUgZmFzdGVyLlxuICAgIHJldHVyblN0ZXBMYXQ6IDAuNSxcbiAgICByZXR1cm5TdGVwTG9uOiAyLFxuICAgIGJhY2tUb1ZlcnRpY2FsQ2VudGVyOiAhcnVuT25Nb2JpbGUsXG4gICAgYmFja1RvSG9yaXpvbkNlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGNsaWNrVG9Ub2dnbGU6IGZhbHNlLFxuXG4gICAgLy9saW1pdCB2aWV3YWJsZSB6b29tXG4gICAgbWluTGF0OiAtODUsXG4gICAgbWF4TGF0OiA4NSxcblxuICAgIG1pbkxvbjogLUluZmluaXR5LFxuICAgIG1heExvbjogSW5maW5pdHksXG5cbiAgICB2aWRlb1R5cGU6IFwiZXF1aXJlY3Rhbmd1bGFyXCIsXG5cbiAgICByb3RhdGVYOiAwLFxuICAgIHJvdGF0ZVk6IDAsXG4gICAgcm90YXRlWjogMCxcblxuICAgIGF1dG9Nb2JpbGVPcmllbnRhdGlvbjogZmFsc2UsXG4gICAgbW9iaWxlVmlicmF0aW9uVmFsdWU6IHV0aWwuaXNJb3MoKT8gMC4wMjIgOiAxLFxuXG4gICAgVlJFbmFibGU6IHRydWUsXG4gICAgVlJHYXBEZWdyZWU6IDIuNSxcblxuICAgIGNsb3NlUGFub3JhbWE6IGZhbHNlXG5cblxufTtcblxuZnVuY3Rpb24gcGxheWVyUmVzaXplKHBsYXllcil7XG4gICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUud2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCArIFwicHhcIjtcbiAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUuaGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XG4gICAgfTtcbn1cblxuZnVuY3Rpb24gZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgY2xpY2tGbikge1xuICAgIHZhciByZXNpemVGbiA9IHBsYXllclJlc2l6ZShwbGF5ZXIpO1xuICAgIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUub2ZmKFwidGFwXCIsIGNsaWNrRm4pO1xuICAgIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUub24oXCJ0YXBcIiwgZnVuY3Rpb24gZnVsbHNjcmVlbigpIHtcbiAgICAgICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgICAgIGlmKCFwbGF5ZXIuaXNGdWxsc2NyZWVuKCkpe1xuICAgICAgICAgICAgLy9zZXQgdG8gZnVsbHNjcmVlblxuICAgICAgICAgICAgcGxheWVyLmlzRnVsbHNjcmVlbih0cnVlKTtcbiAgICAgICAgICAgIHBsYXllci5lbnRlckZ1bGxXaW5kb3coKTtcbiAgICAgICAgICAgIHJlc2l6ZUZuKCk7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImRldmljZW1vdGlvblwiLCByZXNpemVGbik7XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgcGxheWVyLmlzRnVsbHNjcmVlbihmYWxzZSk7XG4gICAgICAgICAgICBwbGF5ZXIuZXhpdEZ1bGxXaW5kb3coKTtcbiAgICAgICAgICAgIHBsYXllci5lbCgpLnN0eWxlLndpZHRoID0gXCJcIjtcbiAgICAgICAgICAgIHBsYXllci5lbCgpLnN0eWxlLmhlaWdodCA9IFwiXCI7XG4gICAgICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImRldmljZW1vdGlvblwiLCByZXNpemVGbik7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB0byBpbnZva2Ugd2hlbiB0aGUgcGxheWVyIGlzIHJlYWR5LlxuICpcbiAqIFRoaXMgaXMgYSBncmVhdCBwbGFjZSBmb3IgeW91ciBwbHVnaW4gdG8gaW5pdGlhbGl6ZSBpdHNlbGYuIFdoZW4gdGhpc1xuICogZnVuY3Rpb24gaXMgY2FsbGVkLCB0aGUgcGxheWVyIHdpbGwgaGF2ZSBpdHMgRE9NIGFuZCBjaGlsZCBjb21wb25lbnRzXG4gKiBpbiBwbGFjZS5cbiAqXG4gKiBAZnVuY3Rpb24gb25QbGF5ZXJSZWFkeVxuICogQHBhcmFtICAgIHtQbGF5ZXJ9IHBsYXllclxuICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICovXG5jb25zdCBvblBsYXllclJlYWR5ID0gKHBsYXllciwgb3B0aW9ucywgc2V0dGluZ3MpID0+IHtcbiAgICBwbGF5ZXIuYWRkQ2xhc3MoJ3Zqcy1wYW5vcmFtYScpO1xuICAgIGlmKCFEZXRlY3Rvci53ZWJnbCl7XG4gICAgICAgIFBvcHVwTm90aWZpY2F0aW9uKHBsYXllciwge1xuICAgICAgICAgICAgTm90aWNlTWVzc2FnZTogRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKSxcbiAgICAgICAgICAgIGF1dG9IaWRlTm90aWNlOiBvcHRpb25zLmF1dG9IaWRlTm90aWNlXG4gICAgICAgIH0pO1xuICAgICAgICBpZihvcHRpb25zLmNhbGxiYWNrKXtcbiAgICAgICAgICAgIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHBsYXllci5hZGRDaGlsZCgnQ2FudmFzJywgdXRpbC5kZWVwQ29weShvcHRpb25zKSk7XG4gICAgdmFyIGNhbnZhcyA9IHBsYXllci5nZXRDaGlsZCgnQ2FudmFzJyk7XG4gICAgaWYocnVuT25Nb2JpbGUpe1xuICAgICAgICB2YXIgdmlkZW9FbGVtZW50ID0gc2V0dGluZ3MuZ2V0VGVjaChwbGF5ZXIpO1xuICAgICAgICBpZih1dGlsLmlzUmVhbElwaG9uZSgpKXtcbiAgICAgICAgICAgIG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lKHZpZGVvRWxlbWVudCwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodXRpbC5pc0lvcygpKXtcbiAgICAgICAgICAgIGZ1bGxzY3JlZW5PbklPUyhwbGF5ZXIsIHNldHRpbmdzLmdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuKHBsYXllcikpO1xuICAgICAgICB9XG4gICAgICAgIHBsYXllci5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvXCIpO1xuICAgICAgICBwbGF5ZXIucmVtb3ZlQ2xhc3MoXCJ2anMtdXNpbmctbmF0aXZlLWNvbnRyb2xzXCIpO1xuICAgICAgICBjYW52YXMucGxheU9uTW9iaWxlKCk7XG4gICAgfVxuICAgIGlmKG9wdGlvbnMuc2hvd05vdGljZSl7XG4gICAgICAgIHBsYXllci5vbihcInBsYXlpbmdcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIFBvcHVwTm90aWZpY2F0aW9uKHBsYXllciwgdXRpbC5kZWVwQ29weShvcHRpb25zKSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpZihvcHRpb25zLlZSRW5hYmxlICYmIG9wdGlvbnMudmlkZW9UeXBlICE9PSBcIjNkVmlkZW9cIil7XG4gICAgICAgIHBsYXllci5jb250cm9sQmFyLmFkZENoaWxkKCdWUkJ1dHRvbicsIHt9LCBwbGF5ZXIuY29udHJvbEJhci5jaGlsZHJlbigpLmxlbmd0aCAtIDEpO1xuICAgIH1cbiAgICBjYW52YXMuaGlkZSgpO1xuICAgIHBsYXllci5vbihcInBsYXlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBjYW52YXMuc2hvdygpO1xuICAgIH0pO1xuICAgIHBsYXllci5vbihcImZ1bGxzY3JlZW5jaGFuZ2VcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBjYW52YXMuaGFuZGxlUmVzaXplKCk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBQb3B1cE5vdGlmaWNhdGlvbiA9IChwbGF5ZXIsIG9wdGlvbnMgPSB7XG4gICAgTm90aWNlTWVzc2FnZTogXCJcIlxufSkgPT4ge1xuICAgIHZhciBub3RpY2UgPSBwbGF5ZXIuYWRkQ2hpbGQoJ05vdGljZScsIG9wdGlvbnMpO1xuXG4gICAgaWYob3B0aW9ucy5hdXRvSGlkZU5vdGljZSA+IDApe1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIG5vdGljZS5hZGRDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgIHZhciB0cmFuc2l0aW9uRXZlbnQgPSB1dGlsLndoaWNoVHJhbnNpdGlvbkV2ZW50KCk7XG4gICAgICAgICAgICB2YXIgaGlkZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBub3RpY2UuaGlkZSgpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5yZW1vdmVDbGFzcyhcInZqcy12aWRlby1ub3RpY2UtZmFkZU91dFwiKTtcbiAgICAgICAgICAgICAgICBub3RpY2Uub2ZmKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgbm90aWNlLm9uKHRyYW5zaXRpb25FdmVudCwgaGlkZSk7XG4gICAgICAgIH0sIG9wdGlvbnMuYXV0b0hpZGVOb3RpY2UpO1xuICAgIH1cbn07XG5cbmNvbnN0IHBsdWdpbiA9IGZ1bmN0aW9uKHNldHRpbmdzID0ge30pe1xuICAgIC8qKlxuICAgICAqIEEgdmlkZW8uanMgcGx1Z2luLlxuICAgICAqXG4gICAgICogSW4gdGhlIHBsdWdpbiBmdW5jdGlvbiwgdGhlIHZhbHVlIG9mIGB0aGlzYCBpcyBhIHZpZGVvLmpzIGBQbGF5ZXJgXG4gICAgICogaW5zdGFuY2UuIFlvdSBjYW5ub3QgcmVseSBvbiB0aGUgcGxheWVyIGJlaW5nIGluIGEgXCJyZWFkeVwiIHN0YXRlIGhlcmUsXG4gICAgICogZGVwZW5kaW5nIG9uIGhvdyB0aGUgcGx1Z2luIGlzIGludm9rZWQuIFRoaXMgbWF5IG9yIG1heSBub3QgYmUgaW1wb3J0YW50XG4gICAgICogdG8geW91OyBpZiBub3QsIHJlbW92ZSB0aGUgd2FpdCBmb3IgXCJyZWFkeVwiIVxuICAgICAqXG4gICAgICogQGZ1bmN0aW9uIHBhbm9yYW1hXG4gICAgICogQHBhcmFtICAgIHtPYmplY3R9IFtvcHRpb25zPXt9XVxuICAgICAqICAgICAgICAgICBBbiBvYmplY3Qgb2Ygb3B0aW9ucyBsZWZ0IHRvIHRoZSBwbHVnaW4gYXV0aG9yIHRvIGRlZmluZS5cbiAgICAgKi9cbiAgICBjb25zdCB2aWRlb1R5cGVzID0gW1wiZXF1aXJlY3Rhbmd1bGFyXCIsIFwiZmlzaGV5ZVwiLCBcIjNkVmlkZW9cIl07XG4gICAgY29uc3QgcGFub3JhbWEgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIGlmKHNldHRpbmdzLm1lcmdlT3B0aW9uKSBvcHRpb25zID0gc2V0dGluZ3MubWVyZ2VPcHRpb24oZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgICAgICBpZih0eXBlb2Ygc2V0dGluZ3MuX2luaXQgPT09IFwidW5kZWZpbmVkXCIgfHwgdHlwZW9mIHNldHRpbmdzLl9pbml0ICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJwbHVnaW4gbXVzdCBpbXBsZW1lbnQgaW5pdCBmdW5jdGlvbigpLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZih2aWRlb1R5cGVzLmluZGV4T2Yob3B0aW9ucy52aWRlb1R5cGUpID09IC0xKSBvcHRpb25zLnZpZGVvVHlwZSA9IGRlZmF1bHRzLnZpZGVvVHlwZTtcbiAgICAgICAgc2V0dGluZ3MuX2luaXQob3B0aW9ucyk7XG4gICAgICAgIC8qIGltcGxlbWVudCBjYWxsYmFjayBmdW5jdGlvbiB3aGVuIHZpZGVvanMgaXMgcmVhZHkgKi9cbiAgICAgICAgdGhpcy5yZWFkeSgoKSA9PiB7XG4gICAgICAgICAgICBvblBsYXllclJlYWR5KHRoaXMsIG9wdGlvbnMsIHNldHRpbmdzKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuLy8gSW5jbHVkZSB0aGUgdmVyc2lvbiBudW1iZXIuXG4gICAgcGFub3JhbWEuVkVSU0lPTiA9ICcwLjAuOSc7XG5cbiAgICByZXR1cm4gcGFub3JhbWE7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBwbHVnaW47XG4iLCIndXNlIHN0cmljdCc7XG5cbmltcG9ydCBDYW52YXMgIGZyb20gJy4vbGliL0NhbnZhcyc7XG5pbXBvcnQgVGhyZWVEQ2FudmFzIGZyb20gJy4vbGliL1RocmVlQ2FudmFzJztcbmltcG9ydCBOb3RpY2UgIGZyb20gJy4vbGliL05vdGljZSc7XG5pbXBvcnQgSGVscGVyQ2FudmFzIGZyb20gJy4vbGliL0hlbHBlckNhbnZhcyc7XG5pbXBvcnQgVlJCdXR0b24gZnJvbSAnLi9saWIvVlJCdXR0b24nO1xuaW1wb3J0IHBhbm9yYW1hIGZyb20gJy4vcGx1Z2luJztcblxuZnVuY3Rpb24gZ2V0VGVjaChwbGF5ZXIpIHtcbiAgICByZXR1cm4gcGxheWVyLnRlY2goeyBJV2lsbE5vdFVzZVRoaXNJblBsdWdpbnM6IHRydWUgfSkuZWwoKTtcbn1cblxuZnVuY3Rpb24gZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSB7XG4gICAgcmV0dXJuIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUuaGFuZGxlQ2xpY2tcbn1cblxudmFyIGNvbXBvbmVudCA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KCdDb21wb25lbnQnKTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnTm90aWNlJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBub3RpY2UpKTtcblxudmFyIGhlbHBlckNhbnZhcyA9IEhlbHBlckNhbnZhcyhjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnSGVscGVyQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBoZWxwZXJDYW52YXMpKTtcblxudmFyIGJ1dHRvbiA9IHZpZGVvanMuZ2V0Q29tcG9uZW50KFwiQnV0dG9uXCIpO1xudmFyIHZyQnRuID0gVlJCdXR0b24oYnV0dG9uKTtcbnZpZGVvanMucmVnaXN0ZXJDb21wb25lbnQoJ1ZSQnV0dG9uJywgdmlkZW9qcy5leHRlbmQoYnV0dG9uLCB2ckJ0bikpO1xuXG4vLyBSZWdpc3RlciB0aGUgcGx1Z2luIHdpdGggdmlkZW8uanMuXG52aWRlb2pzLnBsdWdpbigncGFub3JhbWEnLCBwYW5vcmFtYSh7XG4gICAgX2luaXQ6IGZ1bmN0aW9uKG9wdGlvbnMpe1xuICAgICAgICB2YXIgY2FudmFzID0gKG9wdGlvbnMudmlkZW9UeXBlICE9PSBcIjNkVmlkZW9cIik/XG4gICAgICAgICAgICBDYW52YXMoY29tcG9uZW50LCB3aW5kb3cuVEhSRUUsIHtcbiAgICAgICAgICAgICAgICBnZXRUZWNoOiBnZXRUZWNoXG4gICAgICAgICAgICB9KSA6XG4gICAgICAgICAgICBUaHJlZURDYW52YXMoY29tcG9uZW50LCB3aW5kb3cuVEhSRUUsIHtcbiAgICAgICAgICAgICAgICBnZXRUZWNoOiBnZXRUZWNoXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgdmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBjYW52YXMpKTtcbiAgICB9LFxuICAgIG1lcmdlT3B0aW9uOiBmdW5jdGlvbiAoZGVmYXVsdHMsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHZpZGVvanMubWVyZ2VPcHRpb25zKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICB9LFxuICAgIGdldFRlY2g6IGdldFRlY2gsXG4gICAgZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm46IGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuXG59KSk7XG4iXX0=
