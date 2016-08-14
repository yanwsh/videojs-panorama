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
'use strict';

var _Detector = require('../lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _MobileBuffering = require('../lib/MobileBuffering');

var _MobileBuffering2 = _interopRequireDefault(_MobileBuffering);

var _Util = require('./Util');

var _Util2 = _interopRequireDefault(_Util);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var HAVE_ENOUGH_DATA = 4; /**
                           * Created by yanwsh on 4/3/16.
                           */


var Canvas = function Canvas(baseComponent) {
    var settings = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    return {
        constructor: function init(player, options) {
            this.settings = options;
            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.videoType = options.videoType;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;
            this.VRMode = false;
            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.camera = new THREE.PerspectiveCamera(options.initFov, this.width / this.height, 1, 2000);
            this.camera.target = new THREE.Vector3(0, 0, 0);
            //define render
            this.renderer = new THREE.WebGLRenderer();
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(this.width, this.height);
            this.renderer.autoClear = false;
            this.renderer.setClearColor(0x000000, 1);

            //define texture
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
            this.el_ = this.renderer.domElement;
            this.el_.classList.add('vjs-video-canvas');

            options.el = this.el_;
            baseComponent.call(this, player, options);

            this.attachControlEvents();
            this.player().on("play", function () {
                this.time = new Date().getTime();
                this.animate();
            }.bind(this));

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
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            if (this.VRMode) {
                this.cameraL.aspect = this.camera.aspect / 2;
                this.cameraR.aspect = this.camera.aspect / 2;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
            this.renderer.setSize(this.width, this.height);
        },

        handleMouseUp: function handleMouseUp(event) {
            this.mouseDown = false;
            if (this.clickToToggle) {
                var clientX = event.clientX || event.changedTouches[0].clientX;
                var clientY = event.clientY || event.changedTouches[0].clientY;
                var diffX = Math.abs(clientX - this.onPointerDownPointerX);
                var diffY = Math.abs(clientY - this.onPointerDownPointerY);
                if (diffX < 0.1 && diffY < 0.1) this.player().paused() ? this.player().play() : this.player().pause();
            }
        },

        handleMouseDown: function handleMouseDown(event) {
            event.preventDefault();
            var clientX = event.clientX || event.touches[0].clientX;
            var clientY = event.clientY || event.touches[0].clientY;
            this.mouseDown = true;
            this.onPointerDownPointerX = clientX;
            this.onPointerDownPointerY = clientY;
            this.onPointerDownLon = this.lon;
            this.onPointerDownLat = this.lat;
        },

        handleMouseMove: function handleMouseMove(event) {
            var clientX = event.clientX || event.touches[0].clientX;
            var clientY = event.clientY || event.touches[0].clientY;
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
            this.camera.target.x = 500 * Math.sin(this.phi) * Math.cos(this.theta);
            this.camera.target.y = 500 * Math.cos(this.phi);
            this.camera.target.z = 500 * Math.sin(this.phi) * Math.sin(this.theta);
            this.camera.lookAt(this.camera.target);

            if (!this.supportVideoTexture) {
                this.helperCanvas.update();
            }
            this.renderer.clear();
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

                    var targetL = _Util2.default.extend(this.camera.target);
                    targetL.x = 500 * Math.sin(this.phi) * Math.cos(thetaL);
                    targetL.z = 500 * Math.sin(this.phi) * Math.sin(thetaL);
                    this.cameraL.lookAt(targetL);

                    var targetR = _Util2.default.extend(this.camera.target);
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

module.exports = Canvas;

},{"../lib/Detector":4,"../lib/MobileBuffering":6,"./Util":8}],4:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

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

// browserify support
if ((typeof module === 'undefined' ? 'undefined' : _typeof(module)) === 'object') {

    module.exports = Detector;
}

},{}],5:[function(require,module,exports){
"use strict";

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

module.exports = HelperCanvas;

},{}],6:[function(require,module,exports){
"use strict";

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

module.exports = MobileBuffering;

},{}],7:[function(require,module,exports){
"use strict";

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

module.exports = Notice;

},{}],8:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

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

function extend(from, to) {
    if (from == null || (typeof from === 'undefined' ? 'undefined' : _typeof(from)) != "object") return from;
    if (from.constructor != Object && from.constructor != Array) return from;
    if (from.constructor == Date || from.constructor == RegExp || from.constructor == Function || from.constructor == String || from.constructor == Number || from.constructor == Boolean) return new from.constructor(from);

    to = to || new from.constructor();

    for (var name in from) {
        to[name] = typeof to[name] == "undefined" ? extend(from[name], null) : to[name];
    }

    return to;
}

module.exports = {
    whichTransitionEvent: whichTransitionEvent,
    mobileAndTabletcheck: mobileAndTabletcheck,
    isIos: isIos,
    isRealIphone: isRealIphone,
    fovToProjection: fovToProjection,
    extend: extend
};

},{}],9:[function(require,module,exports){
"use strict";

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
        },

        controlText_: "VR"
    };
};

module.exports = VRButton;

},{}],10:[function(require,module,exports){
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
    VRGapDegree: 2.5
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
    player.addChild('Canvas', _Util2.default.extend(options));
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
            PopupNotification(player, _Util2.default.extend(options));
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
};

var PopupNotification = function PopupNotification(player) {
    var options = arguments.length <= 1 || arguments[1] === undefined ? {
        NoticeMessage: ""
    } : arguments[1];

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
    var settings = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

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
    var videoTypes = ["equirectangular", "fisheye"];
    var panorama = function panorama(options) {
        var _this = this;

        if (settings.mergeOption) options = settings.mergeOption(defaults, options);
        if (videoTypes.indexOf(options.videoType) == -1) defaults.videoType;
        this.ready(function () {
            onPlayerReady(_this, options, settings);
        });
    };

    // Include the version number.
    panorama.VERSION = '0.0.7';

    return panorama;
};

exports.default = plugin;

},{"./lib/Detector":4,"./lib/Util":8,"iphone-inline-video":1}],11:[function(require,module,exports){
'use strict';

var _Canvas = require('./lib/Canvas');

var _Canvas2 = _interopRequireDefault(_Canvas);

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
var canvas = (0, _Canvas2.default)(component, {
    getTech: getTech
});
canvas.init = compatiableInitialFunction;
videojs.Canvas = component.extend(canvas);

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
    mergeOption: function mergeOption(defaults, options) {
        return videojs.util.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));

},{"./lib/Canvas":3,"./lib/HelperCanvas":5,"./lib/Notice":7,"./lib/VRButton":9,"./plugin":10}]},{},[11])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwibm9kZV9tb2R1bGVzL3Bvb3ItbWFucy1zeW1ib2wvZGlzdC9wb29yLW1hbnMtc3ltYm9sLmNvbW1vbi1qcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9DYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvRGV0ZWN0b3IuanMiLCJzcmMvc2NyaXB0cy9saWIvSGVscGVyQ2FudmFzLmpzIiwic3JjL3NjcmlwdHMvbGliL01vYmlsZUJ1ZmZlcmluZy5qcyIsInNyYy9zY3JpcHRzL2xpYi9Ob3RpY2UuanMiLCJzcmMvc2NyaXB0cy9saWIvVXRpbC5qcyIsInNyYy9zY3JpcHRzL2xpYi9WUkJ1dHRvbi5qcyIsInNyYy9zY3JpcHRzL3BsdWdpbi5qcyIsInNyYy9zY3JpcHRzL3BsdWdpbl92NC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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QU4sR0FBVyxNQUFNLFlBQXBDO0FBQ0EsTUFBTSxDQUFOLEdBQVUsWUFBWTtBQUNsQiwrQkFBeUIsT0FBTyxTQUFQLENBQWlCLENBQWpCLENBQW1CLElBQW5CLENBQXdCLElBQXhCLENBQXpCO0FBQ0gsQ0FGRDtBQUdBLFFBQVEsUUFBUixHQUFtQixPQUFPLE1BQVAsQ0FBYyxLQUFkLENBQW5COztBQUVBO0FBQ0EsUUFBUSxNQUFSLENBQWUsVUFBZixFQUEyQixzQkFBUztBQUNoQyxpQkFBYSxxQkFBVSxRQUFWLEVBQW9CLE9BQXBCLEVBQTZCO0FBQ3RDLGVBQU8sUUFBUSxJQUFSLENBQWEsWUFBYixDQUEwQixRQUExQixFQUFvQyxPQUFwQyxDQUFQO0FBQ0gsS0FIK0I7QUFJaEMsYUFBUyxPQUp1QjtBQUtoQyxnQ0FBNEI7QUFMSSxDQUFULENBQTNCIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qISBucG0uaW0vaXBob25lLWlubGluZS12aWRlbyAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBfaW50ZXJvcERlZmF1bHQgKGV4KSB7IHJldHVybiAoZXggJiYgKHR5cGVvZiBleCA9PT0gJ29iamVjdCcpICYmICdkZWZhdWx0JyBpbiBleCkgPyBleFsnZGVmYXVsdCddIDogZXg7IH1cblxudmFyIFN5bWJvbCA9IF9pbnRlcm9wRGVmYXVsdChyZXF1aXJlKCdwb29yLW1hbnMtc3ltYm9sJykpO1xuXG5mdW5jdGlvbiBJbnRlcnZhbG9tZXRlcihjYikge1xuXHR2YXIgcmFmSWQ7XG5cdHZhciBwcmV2aW91c0xvb3BUaW1lO1xuXHRmdW5jdGlvbiBsb29wKG5vdykge1xuXHRcdC8vIG11c3QgYmUgcmVxdWVzdGVkIGJlZm9yZSBjYigpIGJlY2F1c2UgdGhhdCBtaWdodCBjYWxsIC5zdG9wKClcblx0XHRyYWZJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblx0XHRjYihub3cgLSAocHJldmlvdXNMb29wVGltZSB8fCBub3cpKTsgLy8gbXMgc2luY2UgbGFzdCBjYWxsLiAwIG9uIHN0YXJ0KClcblx0XHRwcmV2aW91c0xvb3BUaW1lID0gbm93O1xuXHR9XG5cdHRoaXMuc3RhcnQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCFyYWZJZCkgeyAvLyBwcmV2ZW50IGRvdWJsZSBzdGFydHNcblx0XHRcdGxvb3AoMCk7XG5cdFx0fVxuXHR9O1xuXHR0aGlzLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG5cdFx0Y2FuY2VsQW5pbWF0aW9uRnJhbWUocmFmSWQpO1xuXHRcdHJhZklkID0gbnVsbDtcblx0XHRwcmV2aW91c0xvb3BUaW1lID0gMDtcblx0fTtcbn1cblxuZnVuY3Rpb24gcHJldmVudEV2ZW50KGVsZW1lbnQsIGV2ZW50TmFtZSwgdG9nZ2xlUHJvcGVydHksIHByZXZlbnRXaXRoUHJvcGVydHkpIHtcblx0ZnVuY3Rpb24gaGFuZGxlcihlKSB7XG5cdFx0aWYgKEJvb2xlYW4oZWxlbWVudFt0b2dnbGVQcm9wZXJ0eV0pID09PSBCb29sZWFuKHByZXZlbnRXaXRoUHJvcGVydHkpKSB7XG5cdFx0XHRlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0Ly8gY29uc29sZS5sb2coZXZlbnROYW1lLCAncHJldmVudGVkIG9uJywgZWxlbWVudCk7XG5cdFx0fVxuXHRcdGRlbGV0ZSBlbGVtZW50W3RvZ2dsZVByb3BlcnR5XTtcblx0fVxuXHRlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBoYW5kbGVyLCBmYWxzZSk7XG5cblx0Ly8gUmV0dXJuIGhhbmRsZXIgdG8gYWxsb3cgdG8gZGlzYWJsZSB0aGUgcHJldmVudGlvbi4gVXNhZ2U6XG5cdC8vIGNvbnN0IHByZXZlbnRpb25IYW5kbGVyID0gcHJldmVudEV2ZW50KGVsLCAnY2xpY2snKTtcblx0Ly8gZWwucmVtb3ZlRXZlbnRIYW5kbGVyKCdjbGljaycsIHByZXZlbnRpb25IYW5kbGVyKTtcblx0cmV0dXJuIGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHByb3h5UHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHNvdXJjZU9iamVjdCwgY29weUZpcnN0KSB7XG5cdGZ1bmN0aW9uIGdldCgpIHtcblx0XHRyZXR1cm4gc291cmNlT2JqZWN0W3Byb3BlcnR5TmFtZV07XG5cdH1cblx0ZnVuY3Rpb24gc2V0KHZhbHVlKSB7XG5cdFx0c291cmNlT2JqZWN0W3Byb3BlcnR5TmFtZV0gPSB2YWx1ZTtcblx0fVxuXG5cdGlmIChjb3B5Rmlyc3QpIHtcblx0XHRzZXQob2JqZWN0W3Byb3BlcnR5TmFtZV0pO1xuXHR9XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iamVjdCwgcHJvcGVydHlOYW1lLCB7Z2V0OiBnZXQsIHNldDogc2V0fSk7XG59XG5cbmZ1bmN0aW9uIHByb3h5RXZlbnQob2JqZWN0LCBldmVudE5hbWUsIHNvdXJjZU9iamVjdCkge1xuXHRzb3VyY2VPYmplY3QuYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIGZ1bmN0aW9uICgpIHsgcmV0dXJuIG9iamVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChldmVudE5hbWUpKTsgfSk7XG59XG5cbmZ1bmN0aW9uIGRpc3BhdGNoRXZlbnRBc3luYyhlbGVtZW50LCB0eXBlKSB7XG5cdFByb21pc2UucmVzb2x2ZSgpLnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQodHlwZSkpO1xuXHR9KTtcbn1cblxuLy8gaU9TIDEwIGFkZHMgc3VwcG9ydCBmb3IgbmF0aXZlIGlubGluZSBwbGF5YmFjayArIHNpbGVudCBhdXRvcGxheVxuLy8gQWxzbyBhZGRzIHVucHJlZml4ZWQgY3NzLWdyaWQuIFRoaXMgY2hlY2sgZXNzZW50aWFsbHkgZXhjbHVkZXNcbnZhciBpc1doaXRlbGlzdGVkID0gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSAmJiBkb2N1bWVudC5oZWFkLnN0eWxlLmdyaWQgPT09IHVuZGVmaW5lZDtcblxudmFyIOCyoCA9IFN5bWJvbCgpO1xudmFyIOCyoGV2ZW50ID0gU3ltYm9sKCk7XG52YXIg4LKgcGxheSA9IFN5bWJvbCgnbmF0aXZlcGxheScpO1xudmFyIOCyoHBhdXNlID0gU3ltYm9sKCduYXRpdmVwYXVzZScpO1xuXG4vKipcbiAqIFVUSUxTXG4gKi9cblxuZnVuY3Rpb24gZ2V0QXVkaW9Gcm9tVmlkZW8odmlkZW8pIHtcblx0dmFyIGF1ZGlvID0gbmV3IEF1ZGlvKCk7XG5cdHByb3h5RXZlbnQodmlkZW8sICdwbGF5JywgYXVkaW8pO1xuXHRwcm94eUV2ZW50KHZpZGVvLCAncGxheWluZycsIGF1ZGlvKTtcblx0cHJveHlFdmVudCh2aWRlbywgJ3BhdXNlJywgYXVkaW8pO1xuXHRhdWRpby5jcm9zc09yaWdpbiA9IHZpZGVvLmNyb3NzT3JpZ2luO1xuXG5cdC8vICdkYXRhOicgY2F1c2VzIGF1ZGlvLm5ldHdvcmtTdGF0ZSA+IDBcblx0Ly8gd2hpY2ggdGhlbiBhbGxvd3MgdG8ga2VlcCA8YXVkaW8+IGluIGEgcmVzdW1hYmxlIHBsYXlpbmcgc3RhdGVcblx0Ly8gaS5lLiBvbmNlIHlvdSBzZXQgYSByZWFsIHNyYyBpdCB3aWxsIGtlZXAgcGxheWluZyBpZiBpdCB3YXMgaWYgLnBsYXkoKSB3YXMgY2FsbGVkXG5cdGF1ZGlvLnNyYyA9IHZpZGVvLnNyYyB8fCB2aWRlby5jdXJyZW50U3JjIHx8ICdkYXRhOic7XG5cblx0Ly8gaWYgKGF1ZGlvLnNyYyA9PT0gJ2RhdGE6Jykge1xuXHQvLyAgIFRPRE86IHdhaXQgZm9yIHZpZGVvIHRvIGJlIHNlbGVjdGVkXG5cdC8vIH1cblx0cmV0dXJuIGF1ZGlvO1xufVxuXG52YXIgbGFzdFJlcXVlc3RzID0gW107XG52YXIgcmVxdWVzdEluZGV4ID0gMDtcbnZhciBsYXN0VGltZXVwZGF0ZUV2ZW50O1xuXG5mdW5jdGlvbiBzZXRUaW1lKHZpZGVvLCB0aW1lLCByZW1lbWJlck9ubHkpIHtcblx0Ly8gYWxsb3cgb25lIHRpbWV1cGRhdGUgZXZlbnQgZXZlcnkgMjAwKyBtc1xuXHRpZiAoKGxhc3RUaW1ldXBkYXRlRXZlbnQgfHwgMCkgKyAyMDAgPCBEYXRlLm5vdygpKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHRsYXN0VGltZXVwZGF0ZUV2ZW50ID0gRGF0ZS5ub3coKTtcblx0fVxuXHRpZiAoIXJlbWVtYmVyT25seSkge1xuXHRcdHZpZGVvLmN1cnJlbnRUaW1lID0gdGltZTtcblx0fVxuXHRsYXN0UmVxdWVzdHNbKytyZXF1ZXN0SW5kZXggJSAzXSA9IHRpbWUgKiAxMDAgfCAwIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBpc1BsYXllckVuZGVkKHBsYXllcikge1xuXHRyZXR1cm4gcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA+PSBwbGF5ZXIudmlkZW8uZHVyYXRpb247XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZSh0aW1lRGlmZikge1xuXHR2YXIgcGxheWVyID0gdGhpcztcblx0Ly8gY29uc29sZS5sb2coJ3VwZGF0ZScsIHBsYXllci52aWRlby5yZWFkeVN0YXRlLCBwbGF5ZXIudmlkZW8ubmV0d29ya1N0YXRlLCBwbGF5ZXIuZHJpdmVyLnJlYWR5U3RhdGUsIHBsYXllci5kcml2ZXIubmV0d29ya1N0YXRlLCBwbGF5ZXIuZHJpdmVyLnBhdXNlZCk7XG5cdGlmIChwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSA+PSBwbGF5ZXIudmlkZW8uSEFWRV9GVVRVUkVfREFUQSkge1xuXHRcdGlmICghcGxheWVyLmhhc0F1ZGlvKSB7XG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gcGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lICsgKHRpbWVEaWZmICogcGxheWVyLnZpZGVvLnBsYXliYWNrUmF0ZSkgLyAxMDAwO1xuXHRcdFx0aWYgKHBsYXllci52aWRlby5sb29wICYmIGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0c2V0VGltZShwbGF5ZXIudmlkZW8sIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUpO1xuXHR9IGVsc2UgaWYgKHBsYXllci52aWRlby5uZXR3b3JrU3RhdGUgPT09IHBsYXllci52aWRlby5ORVRXT1JLX0lETEUgJiYgIXBsYXllci52aWRlby5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHQvLyB0aGlzIHNob3VsZCBoYXBwZW4gd2hlbiB0aGUgc291cmNlIGlzIGF2YWlsYWJsZSBidXQ6XG5cdFx0Ly8gLSBpdCdzIHBvdGVudGlhbGx5IHBsYXlpbmcgKC5wYXVzZWQgPT09IGZhbHNlKVxuXHRcdC8vIC0gaXQncyBub3QgcmVhZHkgdG8gcGxheVxuXHRcdC8vIC0gaXQncyBub3QgbG9hZGluZ1xuXHRcdC8vIElmIGl0IGhhc0F1ZGlvLCB0aGF0IHdpbGwgYmUgbG9hZGVkIGluIHRoZSAnZW1wdGllZCcgaGFuZGxlciBiZWxvd1xuXHRcdHBsYXllci52aWRlby5sb2FkKCk7XG5cdFx0Ly8gY29uc29sZS5sb2coJ1dpbGwgbG9hZCcpO1xuXHR9XG5cblx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lID09PSBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lLCAnVmlkZW8gbm90IHVwZGF0aW5nIScpO1xuXG5cdGlmIChwbGF5ZXIudmlkZW8uZW5kZWQpIHtcblx0XHRkZWxldGUgcGxheWVyLnZpZGVvW+CyoGV2ZW50XTsgLy8gYWxsb3cgdGltZXVwZGF0ZSBldmVudFxuXHRcdHBsYXllci52aWRlby5wYXVzZSh0cnVlKTtcblx0fVxufVxuXG4vKipcbiAqIE1FVEhPRFNcbiAqL1xuXG5mdW5jdGlvbiBwbGF5KCkge1xuXHQvLyBjb25zb2xlLmxvZygncGxheScpO1xuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHVzZSB0aGUgbmF0aXZlIHBsYXllclxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwbGF5XSgpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmIChwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gJ2RhdGE6JyAmJiBwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gdmlkZW8uc3JjKSB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkIG9uIHBsYXknLCB2aWRlby5zcmMpO1xuXHRcdHNldFRpbWUodmlkZW8sIDAsIHRydWUpO1xuXHRcdHBsYXllci5kcml2ZXIuc3JjID0gdmlkZW8uc3JjO1xuXHR9XG5cblx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cGxheWVyLnBhdXNlZCA9IGZhbHNlO1xuXG5cdGlmICghdmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0Ly8gLmxvYWQoKSBjYXVzZXMgdGhlIGVtcHRpZWQgZXZlbnRcblx0XHQvLyB0aGUgYWx0ZXJuYXRpdmUgaXMgLnBsYXkoKSsucGF1c2UoKSBidXQgdGhhdCB0cmlnZ2VycyBwbGF5L3BhdXNlIGV2ZW50cywgZXZlbiB3b3JzZVxuXHRcdC8vIHBvc3NpYmx5IHRoZSBhbHRlcm5hdGl2ZSBpcyBwcmV2ZW50aW5nIHRoaXMgZXZlbnQgb25seSBvbmNlXG5cdFx0dmlkZW8ubG9hZCgpO1xuXHR9XG5cblx0cGxheWVyLmRyaXZlci5wbGF5KCk7XG5cdHBsYXllci51cGRhdGVyLnN0YXJ0KCk7XG5cblx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5Jyk7XG5cdFx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0VOT1VHSF9EQVRBKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnb25wbGF5Jyk7XG5cdFx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdwbGF5aW5nJyk7XG5cdFx0fVxuXHR9XG59XG5mdW5jdGlvbiBwYXVzZShmb3JjZUV2ZW50cykge1xuXHQvLyBjb25zb2xlLmxvZygncGF1c2UnKTtcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0cGxheWVyLmRyaXZlci5wYXVzZSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdG9wKCk7XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB0aGUgZGV2ZWxvcGVyIHRoZSBuYXRpdmUgcGxheWVyLnBhdXNlKClcblx0Ly8gVGhpcyBpcyBhdCB0aGUgZW5kIG9mIHBhdXNlKCkgYmVjYXVzZSBpdCBhbHNvXG5cdC8vIG5lZWRzIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBzaW11bGF0aW9uIGlzIHBhdXNlZFxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwYXVzZV0oKTtcblx0fVxuXG5cdGlmIChwbGF5ZXIucGF1c2VkICYmICFmb3JjZUV2ZW50cykge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHBsYXllci5wYXVzZWQgPSB0cnVlO1xuXHRpZiAoIXBsYXllci5oYXNBdWRpbykge1xuXHRcdGRpc3BhdGNoRXZlbnRBc3luYyh2aWRlbywgJ3BhdXNlJyk7XG5cdH1cblx0aWYgKHZpZGVvLmVuZGVkKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHRkaXNwYXRjaEV2ZW50QXN5bmModmlkZW8sICdlbmRlZCcpO1xuXHR9XG59XG5cbi8qKlxuICogU0VUVVBcbiAqL1xuXG5mdW5jdGlvbiBhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdID0ge307XG5cdHBsYXllci5wYXVzZWQgPSB0cnVlOyAvLyB0cmFjayB3aGV0aGVyICdwYXVzZScgZXZlbnRzIGhhdmUgYmVlbiBmaXJlZFxuXHRwbGF5ZXIuaGFzQXVkaW8gPSBoYXNBdWRpbztcblx0cGxheWVyLnZpZGVvID0gdmlkZW87XG5cdHBsYXllci51cGRhdGVyID0gbmV3IEludGVydmFsb21ldGVyKHVwZGF0ZS5iaW5kKHBsYXllcikpO1xuXG5cdGlmIChoYXNBdWRpbykge1xuXHRcdHBsYXllci5kcml2ZXIgPSBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbyk7XG5cdH0gZWxzZSB7XG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignY2FucGxheScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICghdmlkZW8ucGF1c2VkKSB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdvbmNhbnBsYXknKTtcblx0XHRcdFx0ZGlzcGF0Y2hFdmVudEFzeW5jKHZpZGVvLCAncGxheWluZycpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHBsYXllci5kcml2ZXIgPSB7XG5cdFx0XHRzcmM6IHZpZGVvLnNyYyB8fCB2aWRlby5jdXJyZW50U3JjIHx8ICdkYXRhOicsXG5cdFx0XHRtdXRlZDogdHJ1ZSxcblx0XHRcdHBhdXNlZDogdHJ1ZSxcblx0XHRcdHBhdXNlOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGF1c2VkID0gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRwbGF5OiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGF1c2VkID0gZmFsc2U7XG5cdFx0XHRcdC8vIG1lZGlhIGF1dG9tYXRpY2FsbHkgZ29lcyB0byAwIGlmIC5wbGF5KCkgaXMgY2FsbGVkIHdoZW4gaXQncyBkb25lXG5cdFx0XHRcdGlmIChpc1BsYXllckVuZGVkKHBsYXllcikpIHtcblx0XHRcdFx0XHRzZXRUaW1lKHZpZGVvLCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGdldCBlbmRlZCgpIHtcblx0XHRcdFx0cmV0dXJuIGlzUGxheWVyRW5kZWQocGxheWVyKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Ly8gLmxvYWQoKSBjYXVzZXMgdGhlIGVtcHRpZWQgZXZlbnRcblx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignZW1wdGllZCcsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBjb25zb2xlLmxvZygnZHJpdmVyIHNyYyBpcycsIHBsYXllci5kcml2ZXIuc3JjKTtcblx0XHR2YXIgd2FzRW1wdHkgPSAhcGxheWVyLmRyaXZlci5zcmMgfHwgcGxheWVyLmRyaXZlci5zcmMgPT09ICdkYXRhOic7XG5cdFx0aWYgKHBsYXllci5kcml2ZXIuc3JjICYmIHBsYXllci5kcml2ZXIuc3JjICE9PSB2aWRlby5zcmMpIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKCdzcmMgY2hhbmdlZCB0bycsIHZpZGVvLnNyYyk7XG5cdFx0XHRzZXRUaW1lKHZpZGVvLCAwLCB0cnVlKTtcblx0XHRcdHBsYXllci5kcml2ZXIuc3JjID0gdmlkZW8uc3JjO1xuXHRcdFx0Ly8gcGxheWluZyB2aWRlb3Mgd2lsbCBvbmx5IGtlZXAgcGxheWluZyBpZiBubyBzcmMgd2FzIHByZXNlbnQgd2hlbiAucGxheSgp4oCZZWRcblx0XHRcdGlmICh3YXNFbXB0eSkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBsYXkoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBsYXllci51cGRhdGVyLnN0b3AoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sIGZhbHNlKTtcblxuXHQvLyBzdG9wIHByb2dyYW1tYXRpYyBwbGF5ZXIgd2hlbiBPUyB0YWtlcyBvdmVyXG5cdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGJlZ2luZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdFx0Ly8gbWFrZSBzdXJlIHRoYXQgdGhlIDxhdWRpbz4gYW5kIHRoZSBzeW5jZXIvdXBkYXRlciBhcmUgc3RvcHBlZFxuXHRcdFx0dmlkZW8ucGF1c2UoKTtcblxuXHRcdFx0Ly8gcGxheSB2aWRlbyBuYXRpdmVseVxuXHRcdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHR9IGVsc2UgaWYgKGhhc0F1ZGlvICYmICFwbGF5ZXIuZHJpdmVyLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdFx0Ly8gaWYgdGhlIGZpcnN0IHBsYXkgaXMgbmF0aXZlLFxuXHRcdFx0Ly8gdGhlIDxhdWRpbz4gbmVlZHMgdG8gYmUgYnVmZmVyZWQgbWFudWFsbHlcblx0XHRcdC8vIHNvIHdoZW4gdGhlIGZ1bGxzY3JlZW4gZW5kcywgaXQgY2FuIGJlIHNldCB0byB0aGUgc2FtZSBjdXJyZW50IHRpbWVcblx0XHRcdHBsYXllci5kcml2ZXIubG9hZCgpO1xuXHRcdH1cblx0fSk7XG5cdGlmIChoYXNBdWRpbykge1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGVuZGZ1bGxzY3JlZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBzeW5jIGF1ZGlvIHRvIG5ldyB2aWRlbyBwb3NpdGlvblxuXHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHZpZGVvLmN1cnJlbnRUaW1lO1xuXHRcdFx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9PT0gdmlkZW8uY3VycmVudFRpbWUsICdBdWRpbyBub3Qgc3luY2VkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBhbGxvdyBzZWVraW5nXG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmIChsYXN0UmVxdWVzdHMuaW5kZXhPZih2aWRlby5jdXJyZW50VGltZSAqIDEwMCB8IDAgLyAxMDApIDwgMCkge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnVXNlci1yZXF1ZXN0ZWQgc2Vla2luZycpO1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gb3ZlcmxvYWRBUEkodmlkZW8pIHtcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cdHZpZGVvW+CyoHBsYXldID0gdmlkZW8ucGxheTtcblx0dmlkZW9b4LKgcGF1c2VdID0gdmlkZW8ucGF1c2U7XG5cdHZpZGVvLnBsYXkgPSBwbGF5O1xuXHR2aWRlby5wYXVzZSA9IHBhdXNlO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAncGF1c2VkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdtdXRlZCcsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAncGxheWJhY2tSYXRlJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdlbmRlZCcsIHBsYXllci5kcml2ZXIpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnbG9vcCcsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdzZWVraW5nJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtlZCcpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICd0aW1ldXBkYXRlJywg4LKgZXZlbnQsIGZhbHNlKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnZW5kZWQnLCDgsqBldmVudCwgZmFsc2UpOyAvLyBwcmV2ZW50IG9jY2FzaW9uYWwgbmF0aXZlIGVuZGVkIGV2ZW50c1xufVxuXG5mdW5jdGlvbiBlbmFibGVJbmxpbmVWaWRlbyh2aWRlbywgaGFzQXVkaW8sIG9ubHlXaGl0ZWxpc3RlZCkge1xuXHRpZiAoIGhhc0F1ZGlvID09PSB2b2lkIDAgKSBoYXNBdWRpbyA9IHRydWU7XG5cdGlmICggb25seVdoaXRlbGlzdGVkID09PSB2b2lkIDAgKSBvbmx5V2hpdGVsaXN0ZWQgPSB0cnVlO1xuXG5cdGlmICgob25seVdoaXRlbGlzdGVkICYmICFpc1doaXRlbGlzdGVkKSB8fCB2aWRlb1vgsqBdKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGFkZFBsYXllcih2aWRlbywgaGFzQXVkaW8pO1xuXHRvdmVybG9hZEFQSSh2aWRlbyk7XG5cdHZpZGVvLmNsYXNzTGlzdC5hZGQoJ0lJVicpO1xuXHRpZiAoIWhhc0F1ZGlvICYmIHZpZGVvLmF1dG9wbGF5KSB7XG5cdFx0dmlkZW8ucGxheSgpO1xuXHR9XG5cdGlmIChuYXZpZ2F0b3IucGxhdGZvcm0gPT09ICdNYWNJbnRlbCcgfHwgbmF2aWdhdG9yLnBsYXRmb3JtID09PSAnV2luZG93cycpIHtcblx0XHRjb25zb2xlLndhcm4oJ2lwaG9uZS1pbmxpbmUtdmlkZW8gaXMgbm90IGd1YXJhbnRlZWQgdG8gd29yayBpbiBlbXVsYXRlZCBlbnZpcm9ubWVudHMnKTtcblx0fVxufVxuXG5lbmFibGVJbmxpbmVWaWRlby5pc1doaXRlbGlzdGVkID0gaXNXaGl0ZWxpc3RlZDtcblxubW9kdWxlLmV4cG9ydHMgPSBlbmFibGVJbmxpbmVWaWRlbzsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBpbmRleCA9IHR5cGVvZiBTeW1ib2wgPT09ICd1bmRlZmluZWQnID8gZnVuY3Rpb24gKGRlc2NyaXB0aW9uKSB7XG5cdHJldHVybiAnQCcgKyAoZGVzY3JpcHRpb24gfHwgJ0AnKSArIE1hdGgucmFuZG9tKCk7XG59IDogU3ltYm9sO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluZGV4OyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxuICovXG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi4vbGliL0RldGVjdG9yJztcbmltcG9ydCBNb2JpbGVCdWZmZXJpbmcgZnJvbSAnLi4vbGliL01vYmlsZUJ1ZmZlcmluZyc7XG5pbXBvcnQgVXRpbCBmcm9tICcuL1V0aWwnO1xuXG5jb25zdCBIQVZFX0VOT1VHSF9EQVRBID0gNDtcblxudmFyIENhbnZhcyA9IGZ1bmN0aW9uIChiYXNlQ29tcG9uZW50LCBzZXR0aW5ncyA9IHt9KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBvcHRpb25zO1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHBsYXllci5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMubG9uID0gb3B0aW9ucy5pbml0TG9uLCB0aGlzLmxhdCA9IG9wdGlvbnMuaW5pdExhdCwgdGhpcy5waGkgPSAwLCB0aGlzLnRoZXRhID0gMDtcbiAgICAgICAgICAgIHRoaXMudmlkZW9UeXBlID0gb3B0aW9ucy52aWRlb1R5cGU7XG4gICAgICAgICAgICB0aGlzLmNsaWNrVG9Ub2dnbGUgPSBvcHRpb25zLmNsaWNrVG9Ub2dnbGU7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIC8vZGVmaW5lIHNjZW5lXG4gICAgICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG4gICAgICAgICAgICAvL2RlZmluZSBjYW1lcmFcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKG9wdGlvbnMuaW5pdEZvdiwgdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0LCAxLCAyMDAwKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCAwLCAwLCAwICk7XG4gICAgICAgICAgICAvL2RlZmluZSByZW5kZXJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmF1dG9DbGVhciA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDbGVhckNvbG9yKDB4MDAwMDAwLCAxKTtcblxuICAgICAgICAgICAgLy9kZWZpbmUgdGV4dHVyZVxuICAgICAgICAgICAgdmFyIHZpZGVvID0gc2V0dGluZ3MuZ2V0VGVjaChwbGF5ZXIpO1xuICAgICAgICAgICAgdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlID0gRGV0ZWN0b3Iuc3VwcG9ydFZpZGVvVGV4dHVyZSgpO1xuICAgICAgICAgICAgaWYoIXRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5oZWxwZXJDYW52YXMgPSBwbGF5ZXIuYWRkQ2hpbGQoXCJIZWxwZXJDYW52YXNcIiwge1xuICAgICAgICAgICAgICAgICAgICB2aWRlbzogdmlkZW8sXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiB0aGlzLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRleHQgPSB0aGlzLmhlbHBlckNhbnZhcy5lbCgpO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKGNvbnRleHQpO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUodmlkZW8pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2aWRlby5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG5cbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUubWF4RmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcbiAgICAgICAgICAgIC8vZGVmaW5lIGdlb21ldHJ5XG4gICAgICAgICAgICB2YXIgZ2VvbWV0cnkgPSAodGhpcy52aWRlb1R5cGUgPT09IFwiZXF1aXJlY3Rhbmd1bGFyXCIpPyBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoNTAwLCA2MCwgNDApOiBuZXcgVEhSRUUuU3BoZXJlQnVmZmVyR2VvbWV0cnkoIDUwMCwgNjAsIDQwICkudG9Ob25JbmRleGVkKCk7XG4gICAgICAgICAgICBpZih0aGlzLnZpZGVvVHlwZSA9PT0gXCJmaXNoZXllXCIpe1xuICAgICAgICAgICAgICAgIHZhciBub3JtYWxzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy5ub3JtYWwuYXJyYXk7XG4gICAgICAgICAgICAgICAgdmFyIHV2cyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMudXYuYXJyYXk7XG4gICAgICAgICAgICAgICAgZm9yICggdmFyIGkgPSAwLCBsID0gbm9ybWFscy5sZW5ndGggLyAzOyBpIDwgbDsgaSArKyApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHggPSBub3JtYWxzWyBpICogMyArIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHkgPSBub3JtYWxzWyBpICogMyArIDEgXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHogPSBub3JtYWxzWyBpICogMyArIDIgXTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgciA9IE1hdGguYXNpbihNYXRoLnNxcnQoeCAqIHggKyB6ICogeikgLyBNYXRoLnNxcnQoeCAqIHggICsgeSAqIHkgKyB6ICogeikpIC8gTWF0aC5QSTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeSA8IDApIHIgPSAxIC0gcjtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRoZXRhID0gKHggPT0gMCAmJiB6ID09IDApPyAwIDogTWF0aC5hY29zKHggLyBNYXRoLnNxcnQoeCAqIHggKyB6ICogeikpO1xuICAgICAgICAgICAgICAgICAgICBpZih6IDwgMCkgdGhldGEgPSB0aGV0YSAqIC0xO1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMCBdID0gLTAuOCAqIHIgKiBNYXRoLmNvcyh0aGV0YSkgKyAwLjU7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAxIF0gPSAwLjggKiByICogTWF0aC5zaW4odGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVYKCBvcHRpb25zLnJvdGF0ZVgpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVkoIG9wdGlvbnMucm90YXRlWSk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWiggb3B0aW9ucy5yb3RhdGVaKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdlb21ldHJ5LnNjYWxlKCAtIDEsIDEsIDEgKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIG1lc2hcbiAgICAgICAgICAgIHRoaXMubWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LFxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGhpcy50ZXh0dXJlfSlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvL3RoaXMubWVzaC5zY2FsZS54ID0gLTE7XG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLm1lc2gpO1xuICAgICAgICAgICAgdGhpcy5lbF8gPSB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmVsXy5jbGFzc0xpc3QuYWRkKCd2anMtdmlkZW8tY2FudmFzJyk7XG5cbiAgICAgICAgICAgIG9wdGlvbnMuZWwgPSB0aGlzLmVsXztcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICB0aGlzLmF0dGFjaENvbnRyb2xFdmVudHMoKTtcbiAgICAgICAgICAgIHRoaXMucGxheWVyKCkub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGUoKTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcbiAgICAgICAgfSxcblxuICAgICAgICBlbmFibGVWUjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYodHlwZW9mIHZySE1EICE9PSAndW5kZWZpbmVkJyl7XG4gICAgICAgICAgICAgICAgdmFyIGV5ZVBhcmFtc0wgPSB2ckhNRC5nZXRFeWVQYXJhbWV0ZXJzKCAnbGVmdCcgKTtcbiAgICAgICAgICAgICAgICB2YXIgZXllUGFyYW1zUiA9IHZySE1ELmdldEV5ZVBhcmFtZXRlcnMoICdyaWdodCcgKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZXllRk9WTCA9IGV5ZVBhcmFtc0wucmVjb21tZW5kZWRGaWVsZE9mVmlldztcbiAgICAgICAgICAgICAgICB0aGlzLmV5ZUZPVlIgPSBleWVQYXJhbXNSLnJlY29tbWVuZGVkRmllbGRPZlZpZXc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhTCA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSh0aGlzLmNhbWVyYS5mb3YsIHRoaXMud2lkdGggLzIgLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYVIgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEodGhpcy5jYW1lcmEuZm92LCB0aGlzLndpZHRoIC8yIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGRpc2FibGVWUjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5WUk1vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNjaXNzb3IoIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXR0YWNoQ29udHJvbEV2ZW50czogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2htb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoc3RhcnQnLHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2V1cCcsIHRoaXMuaGFuZGxlTW91c2VVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoZW5kJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5zY3JvbGxhYmxlKXtcbiAgICAgICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXdoZWVsJywgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWVudGVyJywgdGhpcy5oYW5kbGVNb3VzZUVudGVyLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2VsZWF2ZScsIHRoaXMuaGFuZGxlTW91c2VMZWFzZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLnBsYXllcigpLmVsKCkub2Zmc2V0V2lkdGgsIHRoaXMuaGVpZ2h0ID0gdGhpcy5wbGF5ZXIoKS5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRoaXMud2lkdGggLyB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIGlmKHRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuYXNwZWN0ID0gdGhpcy5jYW1lcmEuYXNwZWN0IC8gMjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYUwudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUoIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VVcDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSBmYWxzZTtcbiAgICAgICAgICAgIGlmKHRoaXMuY2xpY2tUb1RvZ2dsZSl7XG4gICAgICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICAgICAgdmFyIGRpZmZYID0gTWF0aC5hYnMoY2xpZW50WCAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYKTtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlkgPSBNYXRoLmFicyhjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkpO1xuICAgICAgICAgICAgICAgIGlmKGRpZmZYIDwgMC4xICYmIGRpZmZZIDwgMC4xKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLnBhdXNlZCgpID8gdGhpcy5wbGF5ZXIoKS5wbGF5KCkgOiB0aGlzLnBsYXllcigpLnBhdXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VEb3duOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCA9IGNsaWVudFg7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSA9IGNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Mb24gPSB0aGlzLmxvbjtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxhdCA9IHRoaXMubGF0O1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTW92ZTogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmNsaWNrQW5kRHJhZyl7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5tb3VzZURvd24pe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICggdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclggLSBjbGllbnRYICkgKiAwLjIgKyB0aGlzLm9uUG9pbnRlckRvd25Mb247XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKCBjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkgKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxhdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnBhZ2VYIC0gdGhpcy5lbF8ub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGV2ZW50LnBhZ2VZIC0gdGhpcy5lbF8ub2Zmc2V0VG9wO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKHggLyB0aGlzLndpZHRoKSAqIDQzMCAtIDIyNTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICh5IC8gdGhpcy5oZWlnaHQpICogLTE4MCArIDkwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vYmlsZU9yaWVudGF0aW9uOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBldmVudC5yb3RhdGlvblJhdGUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIHZhciB4ID0gZXZlbnQucm90YXRpb25SYXRlLmFscGhhO1xuICAgICAgICAgICAgdmFyIHkgPSBldmVudC5yb3RhdGlvblJhdGUuYmV0YTtcbiAgICAgICAgICAgIHZhciBwb3J0cmFpdCA9ICh0eXBlb2YgZXZlbnQucG9ydHJhaXQgIT09IFwidW5kZWZpbmVkXCIpPyBldmVudC5wb3J0cmFpdCA6IHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBwb3J0cmFpdClcIikubWF0Y2hlcztcbiAgICAgICAgICAgIHZhciBsYW5kc2NhcGUgPSAodHlwZW9mIGV2ZW50LmxhbmRzY2FwZSAhPT0gXCJ1bmRlZmluZWRcIik/IGV2ZW50LmxhbmRzY2FwZSA6IHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBsYW5kc2NhcGUpXCIpLm1hdGNoZXM7XG4gICAgICAgICAgICB2YXIgb3JpZW50YXRpb24gPSBldmVudC5vcmllbnRhdGlvbiB8fCB3aW5kb3cub3JpZW50YXRpb247XG5cbiAgICAgICAgICAgIGlmIChwb3J0cmFpdCkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gdGhpcy5sb24gLSB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IHRoaXMubGF0ICsgeCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICB9ZWxzZSBpZihsYW5kc2NhcGUpe1xuICAgICAgICAgICAgICAgIHZhciBvcmllbnRhdGlvbkRlZ3JlZSA9IC05MDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2Ygb3JpZW50YXRpb24gIT0gXCJ1bmRlZmluZWRcIil7XG4gICAgICAgICAgICAgICAgICAgIG9yaWVudGF0aW9uRGVncmVlID0gb3JpZW50YXRpb247XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSAob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKT8gdGhpcy5sb24gKyB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZSA6IHRoaXMubG9uIC0geCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKT8gdGhpcy5sYXQgKyB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZSA6IHRoaXMubGF0IC0geSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgLy8gV2ViS2l0XG4gICAgICAgICAgICBpZiAoIGV2ZW50LndoZWVsRGVsdGFZICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBGaXJlZm94XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC5kZXRhaWwgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ICs9IGV2ZW50LmRldGFpbCAqIDEuMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5tYXgodGhpcy5zZXR0aW5ncy5taW5Gb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICBpZih0aGlzLlZSTW9kZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLmZvdiA9IHRoaXMuY2FtZXJhLmZvdjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYVIuZm92ID0gdGhpcy5jYW1lcmEuZm92O1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUVudGVyOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTGVhc2U6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFuaW1hdGU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLnJlcXVlc3RBbmltYXRpb25JZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSggdGhpcy5hbmltYXRlLmJpbmQodGhpcykgKTtcbiAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllcigpLnBhdXNlZCgpKXtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YodGhpcy50ZXh0dXJlKSAhPT0gXCJ1bmRlZmluZWRcIiAmJiAoIXRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIoKS5yZWFkeVN0YXRlKCkgPT09IEhBVkVfRU5PVUdIX0RBVEEgfHwgdGhpcy5pc1BsYXlPbk1vYmlsZSAmJiB0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBsYXlpbmdcIikpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3QgLSB0aGlzLnRpbWUgPj0gMzApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBjdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZih0aGlzLmlzUGxheU9uTW9iaWxlKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50VGltZSA9IHRoaXMucGxheWVyKCkuY3VycmVudFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKE1vYmlsZUJ1ZmZlcmluZy5pc0J1ZmZlcmluZyhjdXJyZW50VGltZSkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5hZGRDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZih0aGlzLnBsYXllcigpLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5yZW1vdmVDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGlmKCF0aGlzLmlzVXNlckludGVyYWN0aW5nKXtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTGF0ID0gKHRoaXMubGF0ID4gdGhpcy5zZXR0aW5ncy5pbml0TGF0KT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTG9uID0gKHRoaXMubG9uID4gdGhpcy5zZXR0aW5ncy5pbml0TG9uKT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmJhY2tUb1ZlcnRpY2FsQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA+ICh0aGlzLnNldHRpbmdzLmluaXRMYXQgLSBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQpKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPCAodGhpcy5zZXR0aW5ncy5pbml0TGF0ICsgTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0KSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5zZXR0aW5ncy5pbml0TGF0IDogdGhpcy5sYXQgKyB0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMYXQgKiBzeW1ib2xMYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYmFja1RvSG9yaXpvbkNlbnRlcil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPiAodGhpcy5zZXR0aW5ncy5pbml0TG9uIC0gTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uKSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9uIDwgKHRoaXMuc2V0dGluZ3MuaW5pdExvbiArIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbikpXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMuc2V0dGluZ3MuaW5pdExvbiA6IHRoaXMubG9uICsgdGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTG9uICogc3ltYm9sTG9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMubGF0ID0gTWF0aC5tYXgoIHRoaXMuc2V0dGluZ3MubWluTGF0LCBNYXRoLm1pbiggdGhpcy5zZXR0aW5ncy5tYXhMYXQsIHRoaXMubGF0ICkgKTtcbiAgICAgICAgICAgIHRoaXMubG9uID0gTWF0aC5tYXgoIHRoaXMuc2V0dGluZ3MubWluTG9uLCBNYXRoLm1pbiggdGhpcy5zZXR0aW5ncy5tYXhMb24sIHRoaXMubG9uICkgKTtcbiAgICAgICAgICAgIHRoaXMucGhpID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggOTAgLSB0aGlzLmxhdCApO1xuICAgICAgICAgICAgdGhpcy50aGV0YSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIHRoaXMubG9uICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC55ID0gNTAwICogTWF0aC5jb3MoIHRoaXMucGhpICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmxvb2tBdCggdGhpcy5jYW1lcmEudGFyZ2V0ICk7XG5cbiAgICAgICAgICAgIGlmKCF0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUpe1xuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzLnVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5jbGVhcigpO1xuICAgICAgICAgICAgaWYoIXRoaXMuVlJNb2RlKXtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHZpZXdQb3J0V2lkdGggPSB0aGlzLndpZHRoIC8gMiwgdmlld1BvcnRIZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YgdnJITUQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFMLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZMLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jYW1lcmFSLnByb2plY3Rpb25NYXRyaXggPSBVdGlsLmZvdlRvUHJvamVjdGlvbiggdGhpcy5leWVGT1ZSLCB0cnVlLCB0aGlzLmNhbWVyYS5uZWFyLCB0aGlzLmNhbWVyYS5mYXIgKTtcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxvbkwgPSB0aGlzLmxvbiArIHRoaXMuc2V0dGluZ3MuVlJHYXBEZWdyZWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsb25SID0gdGhpcy5sb24gLSB0aGlzLnNldHRpbmdzLlZSR2FwRGVncmVlO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YUwgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25MICk7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YVIgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCBsb25SICk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldEwgPSBVdGlsLmV4dGVuZCh0aGlzLmNhbWVyYS50YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRMLnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGV0YUwgKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0TC56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhldGFMICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhTC5sb29rQXQodGFyZ2V0TCk7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldFIgPSBVdGlsLmV4dGVuZCh0aGlzLmNhbWVyYS50YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRSLnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGV0YVIgKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Ui56ID0gNTAwICogTWF0aC5zaW4oIHRoaXMucGhpICkgKiBNYXRoLnNpbiggdGhldGFSICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhUi5sb29rQXQodGFyZ2V0Uik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHJlbmRlciBsZWZ0IGV5ZVxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Vmlld3BvcnQoIDAsIDAsIHZpZXdQb3J0V2lkdGgsIHZpZXdQb3J0SGVpZ2h0ICk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTY2lzc29yKCAwLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYUwgKTtcblxuICAgICAgICAgICAgICAgIC8vIHJlbmRlciByaWdodCBleWVcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFZpZXdwb3J0KCB2aWV3UG9ydFdpZHRoLCAwLCB2aWV3UG9ydFdpZHRoLCB2aWV3UG9ydEhlaWdodCApO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Npc3Nvciggdmlld1BvcnRXaWR0aCwgMCwgdmlld1BvcnRXaWR0aCwgdmlld1BvcnRIZWlnaHQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlciggdGhpcy5zY2VuZSwgdGhpcy5jYW1lcmFSICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBwbGF5T25Nb2JpbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaXNQbGF5T25Nb2JpbGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5hdXRvTW9iaWxlT3JpZW50YXRpb24pXG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZW1vdGlvbicsIHRoaXMuaGFuZGxlTW9iaWxlT3JpZW50YXRpb24uYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lbF87XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENhbnZhcztcbiIsIi8qKlxuICogQGF1dGhvciBhbHRlcmVkcSAvIGh0dHA6Ly9hbHRlcmVkcXVhbGlhLmNvbS9cbiAqIEBhdXRob3IgbXIuZG9vYiAvIGh0dHA6Ly9tcmRvb2IuY29tL1xuICovXG5cbnZhciBEZXRlY3RvciA9IHtcblxuICAgIGNhbnZhczogISEgd2luZG93LkNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcbiAgICB3ZWJnbDogKCBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdHJ5IHtcblxuICAgICAgICAgICAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdjYW52YXMnICk7IHJldHVybiAhISAoIHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgJiYgKCBjYW52YXMuZ2V0Q29udGV4dCggJ3dlYmdsJyApIHx8IGNhbnZhcy5nZXRDb250ZXh0KCAnZXhwZXJpbWVudGFsLXdlYmdsJyApICkgKTtcblxuICAgICAgICB9IGNhdGNoICggZSApIHtcblxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIH1cblxuICAgIH0gKSgpLFxuICAgIHdvcmtlcnM6ICEhIHdpbmRvdy5Xb3JrZXIsXG4gICAgZmlsZWFwaTogd2luZG93LkZpbGUgJiYgd2luZG93LkZpbGVSZWFkZXIgJiYgd2luZG93LkZpbGVMaXN0ICYmIHdpbmRvdy5CbG9iLFxuXG4gICAgIENoZWNrX1ZlcnNpb246IGZ1bmN0aW9uKCkge1xuICAgICAgICAgdmFyIHJ2ID0gLTE7IC8vIFJldHVybiB2YWx1ZSBhc3N1bWVzIGZhaWx1cmUuXG5cbiAgICAgICAgIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSAnTWljcm9zb2Z0IEludGVybmV0IEV4cGxvcmVyJykge1xuXG4gICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudCxcbiAgICAgICAgICAgICAgICAgcmUgPSBuZXcgUmVnRXhwKFwiTVNJRSAoWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuXG4gICAgICAgICAgICAgaWYgKHJlLmV4ZWModWEpICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgIH1cbiAgICAgICAgIGVsc2UgaWYgKG5hdmlnYXRvci5hcHBOYW1lID09IFwiTmV0c2NhcGVcIikge1xuICAgICAgICAgICAgIC8vLyBpbiBJRSAxMSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gc2F5cyAndHJpZGVudCdcbiAgICAgICAgICAgICAvLy8gaW4gRWRnZSB0aGUgbmF2aWdhdG9yLmFwcFZlcnNpb24gZG9lcyBub3Qgc2F5IHRyaWRlbnRcbiAgICAgICAgICAgICBpZiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZignVHJpZGVudCcpICE9PSAtMSkgcnYgPSAxMTtcbiAgICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgICB2YXIgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuICAgICAgICAgICAgICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKFwiRWRnZVxcLyhbMC05XXsxLH1bXFxcXC4wLTldezAsfSlcIik7XG4gICAgICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgcnYgPSBwYXJzZUZsb2F0KFJlZ0V4cC4kMSk7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG5cbiAgICAgICAgIHJldHVybiBydjtcbiAgICAgfSxcblxuICAgIHN1cHBvcnRWaWRlb1RleHR1cmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy9pZSAxMSBhbmQgZWRnZSAxMiBkb2Vzbid0IHN1cHBvcnQgdmlkZW8gdGV4dHVyZS5cbiAgICAgICAgdmFyIHZlcnNpb24gPSB0aGlzLkNoZWNrX1ZlcnNpb24oKTtcbiAgICAgICAgcmV0dXJuICh2ZXJzaW9uID09PSAtMSB8fCB2ZXJzaW9uID49IDEzKTtcbiAgICB9LFxuXG4gICAgZ2V0V2ViR0xFcnJvck1lc3NhZ2U6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICB2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdkaXYnICk7XG4gICAgICAgIGVsZW1lbnQuaWQgPSAnd2ViZ2wtZXJyb3ItbWVzc2FnZSc7XG5cbiAgICAgICAgaWYgKCAhIHRoaXMud2ViZ2wgKSB7XG5cbiAgICAgICAgICAgIGVsZW1lbnQuaW5uZXJIVE1MID0gd2luZG93LldlYkdMUmVuZGVyaW5nQ29udGV4dCA/IFtcbiAgICAgICAgICAgICAgICAnWW91ciBncmFwaGljcyBjYXJkIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+LjxiciAvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKSA6IFtcbiAgICAgICAgICAgICAgICAnWW91ciBicm93c2VyIGRvZXMgbm90IHNlZW0gdG8gc3VwcG9ydCA8YSBocmVmPVwiaHR0cDovL2tocm9ub3Mub3JnL3dlYmdsL3dpa2kvR2V0dGluZ19hX1dlYkdMX0ltcGxlbWVudGF0aW9uXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+V2ViR0w8L2E+Ljxici8+JyxcbiAgICAgICAgICAgICAgICAnRmluZCBvdXQgaG93IHRvIGdldCBpdCA8YSBocmVmPVwiaHR0cDovL2dldC53ZWJnbC5vcmcvXCIgc3R5bGU9XCJjb2xvcjojMDAwXCI+aGVyZTwvYT4uJ1xuICAgICAgICAgICAgXS5qb2luKCAnXFxuJyApO1xuXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudDtcblxuICAgIH0sXG5cbiAgICBhZGRHZXRXZWJHTE1lc3NhZ2U6IGZ1bmN0aW9uICggcGFyYW1ldGVycyApIHtcblxuICAgICAgICB2YXIgcGFyZW50LCBpZCwgZWxlbWVudDtcblxuICAgICAgICBwYXJhbWV0ZXJzID0gcGFyYW1ldGVycyB8fCB7fTtcblxuICAgICAgICBwYXJlbnQgPSBwYXJhbWV0ZXJzLnBhcmVudCAhPT0gdW5kZWZpbmVkID8gcGFyYW1ldGVycy5wYXJlbnQgOiBkb2N1bWVudC5ib2R5O1xuICAgICAgICBpZCA9IHBhcmFtZXRlcnMuaWQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMuaWQgOiAnb2xkaWUnO1xuXG4gICAgICAgIGVsZW1lbnQgPSBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpO1xuICAgICAgICBlbGVtZW50LmlkID0gaWQ7XG5cbiAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKCBlbGVtZW50ICk7XG5cbiAgICB9XG5cbn07XG5cbi8vIGJyb3dzZXJpZnkgc3VwcG9ydFxuaWYgKCB0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyApIHtcblxuICAgIG1vZHVsZS5leHBvcnRzID0gRGV0ZWN0b3I7XG5cbn0iLCIvKipcbiAqIENyZWF0ZWQgYnkgd2Vuc2hlbmcueWFuIG9uIDUvMjMvMTYuXG4gKi9cbnZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5lbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLWhlbHBlci1jYW52YXNcIjtcblxudmFyIEhlbHBlckNhbnZhcyA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICB0aGlzLnZpZGVvRWxlbWVudCA9IG9wdGlvbnMudmlkZW87XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gb3B0aW9ucy53aWR0aDtcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XG5cbiAgICAgICAgICAgIGVsZW1lbnQud2lkdGggPSB0aGlzLndpZHRoO1xuICAgICAgICAgICAgZWxlbWVudC5oZWlnaHQgPSB0aGlzLmhlaWdodDtcbiAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG5cblxuICAgICAgICAgICAgdGhpcy5jb250ZXh0ID0gZWxlbWVudC5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBnZXRDb250ZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dDsgIFxuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnRleHQuZHJhd0ltYWdlKHRoaXMudmlkZW9FbGVtZW50LCAwLCAwLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBIZWxwZXJDYW52YXM7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA2LzYvMTYuXG4gKi9cbnZhciBNb2JpbGVCdWZmZXJpbmcgPSB7XG4gICAgcHJldl9jdXJyZW50VGltZTogMCxcbiAgICBjb3VudGVyOiAwLFxuICAgIFxuICAgIGlzQnVmZmVyaW5nOiBmdW5jdGlvbiAoY3VycmVudFRpbWUpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lID09IHRoaXMucHJldl9jdXJyZW50VGltZSkgdGhpcy5jb3VudGVyKys7XG4gICAgICAgIGVsc2UgdGhpcy5jb3VudGVyID0gMDtcbiAgICAgICAgdGhpcy5wcmV2X2N1cnJlbnRUaW1lID0gY3VycmVudFRpbWU7XG4gICAgICAgIGlmKHRoaXMuY291bnRlciA+IDEwKXtcbiAgICAgICAgICAgIC8vbm90IGxldCBjb3VudGVyIG92ZXJmbG93XG4gICAgICAgICAgICB0aGlzLmNvdW50ZXIgPSAxMDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1vYmlsZUJ1ZmZlcmluZzsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvNC8xNi5cbiAqL1xuXG52YXIgTm90aWNlID0gZnVuY3Rpb24oYmFzZUNvbXBvbmVudCl7XG4gICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbGVtZW50LmNsYXNzTmFtZSA9IFwidmpzLXZpZGVvLW5vdGljZS1sYWJlbFwiO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJvYmplY3RcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gb3B0aW9ucy5Ob3RpY2VNZXNzYWdlO1xuICAgICAgICAgICAgfWVsc2UgaWYodHlwZW9mIG9wdGlvbnMuTm90aWNlTWVzc2FnZSA9PSBcInN0cmluZ1wiKXtcbiAgICAgICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmVsID0gZWxlbWVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICB9XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBOb3RpY2U7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA0LzQvMTYuXG4gKi9cbmZ1bmN0aW9uIHdoaWNoVHJhbnNpdGlvbkV2ZW50KCl7XG4gICAgdmFyIHQ7XG4gICAgdmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZmFrZWVsZW1lbnQnKTtcbiAgICB2YXIgdHJhbnNpdGlvbnMgPSB7XG4gICAgICAgICd0cmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdPVHJhbnNpdGlvbic6J29UcmFuc2l0aW9uRW5kJyxcbiAgICAgICAgJ01velRyYW5zaXRpb24nOid0cmFuc2l0aW9uZW5kJyxcbiAgICAgICAgJ1dlYmtpdFRyYW5zaXRpb24nOid3ZWJraXRUcmFuc2l0aW9uRW5kJ1xuICAgIH07XG5cbiAgICBmb3IodCBpbiB0cmFuc2l0aW9ucyl7XG4gICAgICAgIGlmKCBlbC5zdHlsZVt0XSAhPT0gdW5kZWZpbmVkICl7XG4gICAgICAgICAgICByZXR1cm4gdHJhbnNpdGlvbnNbdF07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1vYmlsZUFuZFRhYmxldGNoZWNrKCkge1xuICAgIHZhciBjaGVjayA9IGZhbHNlO1xuICAgIChmdW5jdGlvbihhKXtpZigvKGFuZHJvaWR8YmJcXGQrfG1lZWdvKS4rbW9iaWxlfGF2YW50Z298YmFkYVxcL3xibGFja2JlcnJ5fGJsYXplcnxjb21wYWx8ZWxhaW5lfGZlbm5lY3xoaXB0b3B8aWVtb2JpbGV8aXAoaG9uZXxvZCl8aXJpc3xraW5kbGV8bGdlIHxtYWVtb3xtaWRwfG1tcHxtb2JpbGUuK2ZpcmVmb3h8bmV0ZnJvbnR8b3BlcmEgbShvYnxpbilpfHBhbG0oIG9zKT98cGhvbmV8cChpeGl8cmUpXFwvfHBsdWNrZXJ8cG9ja2V0fHBzcHxzZXJpZXMoNHw2KTB8c3ltYmlhbnx0cmVvfHVwXFwuKGJyb3dzZXJ8bGluayl8dm9kYWZvbmV8d2FwfHdpbmRvd3MgY2V8eGRhfHhpaW5vfGFuZHJvaWR8aXBhZHxwbGF5Ym9va3xzaWxrL2kudGVzdChhKXx8LzEyMDd8NjMxMHw2NTkwfDNnc298NHRocHw1MFsxLTZdaXw3NzBzfDgwMnN8YSB3YXxhYmFjfGFjKGVyfG9vfHNcXC0pfGFpKGtvfHJuKXxhbChhdnxjYXxjbyl8YW1vaXxhbihleHxueXx5dyl8YXB0dXxhcihjaHxnbyl8YXModGV8dXMpfGF0dHd8YXUoZGl8XFwtbXxyIHxzICl8YXZhbnxiZShja3xsbHxucSl8YmkobGJ8cmQpfGJsKGFjfGF6KXxicihlfHYpd3xidW1ifGJ3XFwtKG58dSl8YzU1XFwvfGNhcGl8Y2N3YXxjZG1cXC18Y2VsbHxjaHRtfGNsZGN8Y21kXFwtfGNvKG1wfG5kKXxjcmF3fGRhKGl0fGxsfG5nKXxkYnRlfGRjXFwtc3xkZXZpfGRpY2F8ZG1vYnxkbyhjfHApb3xkcygxMnxcXC1kKXxlbCg0OXxhaSl8ZW0obDJ8dWwpfGVyKGljfGswKXxlc2w4fGV6KFs0LTddMHxvc3x3YXx6ZSl8ZmV0Y3xmbHkoXFwtfF8pfGcxIHV8ZzU2MHxnZW5lfGdmXFwtNXxnXFwtbW98Z28oXFwud3xvZCl8Z3IoYWR8dW4pfGhhaWV8aGNpdHxoZFxcLShtfHB8dCl8aGVpXFwtfGhpKHB0fHRhKXxocCggaXxpcCl8aHNcXC1jfGh0KGMoXFwtfCB8X3xhfGd8cHxzfHQpfHRwKXxodShhd3x0Yyl8aVxcLSgyMHxnb3xtYSl8aTIzMHxpYWMoIHxcXC18XFwvKXxpYnJvfGlkZWF8aWcwMXxpa29tfGltMWt8aW5ub3xpcGFxfGlyaXN8amEodHx2KWF8amJyb3xqZW11fGppZ3N8a2RkaXxrZWppfGtndCggfFxcLyl8a2xvbnxrcHQgfGt3Y1xcLXxreW8oY3xrKXxsZShub3x4aSl8bGcoIGd8XFwvKGt8bHx1KXw1MHw1NHxcXC1bYS13XSl8bGlid3xseW54fG0xXFwtd3xtM2dhfG01MFxcL3xtYSh0ZXx1aXx4byl8bWMoMDF8MjF8Y2EpfG1cXC1jcnxtZShyY3xyaSl8bWkobzh8b2F8dHMpfG1tZWZ8bW8oMDF8MDJ8Yml8ZGV8ZG98dChcXC18IHxvfHYpfHp6KXxtdCg1MHxwMXx2ICl8bXdicHxteXdhfG4xMFswLTJdfG4yMFsyLTNdfG4zMCgwfDIpfG41MCgwfDJ8NSl8bjcoMCgwfDEpfDEwKXxuZSgoY3xtKVxcLXxvbnx0Znx3Znx3Z3x3dCl8bm9rKDZ8aSl8bnpwaHxvMmltfG9wKHRpfHd2KXxvcmFufG93ZzF8cDgwMHxwYW4oYXxkfHQpfHBkeGd8cGcoMTN8XFwtKFsxLThdfGMpKXxwaGlsfHBpcmV8cGwoYXl8dWMpfHBuXFwtMnxwbyhja3xydHxzZSl8cHJveHxwc2lvfHB0XFwtZ3xxYVxcLWF8cWMoMDd8MTJ8MjF8MzJ8NjB8XFwtWzItN118aVxcLSl8cXRla3xyMzgwfHI2MDB8cmFrc3xyaW05fHJvKHZlfHpvKXxzNTVcXC98c2EoZ2V8bWF8bW18bXN8bnl8dmEpfHNjKDAxfGhcXC18b298cFxcLSl8c2RrXFwvfHNlKGMoXFwtfDB8MSl8NDd8bWN8bmR8cmkpfHNnaFxcLXxzaGFyfHNpZShcXC18bSl8c2tcXC0wfHNsKDQ1fGlkKXxzbShhbHxhcnxiM3xpdHx0NSl8c28oZnR8bnkpfHNwKDAxfGhcXC18dlxcLXx2ICl8c3koMDF8bWIpfHQyKDE4fDUwKXx0NigwMHwxMHwxOCl8dGEoZ3R8bGspfHRjbFxcLXx0ZGdcXC18dGVsKGl8bSl8dGltXFwtfHRcXC1tb3x0byhwbHxzaCl8dHMoNzB8bVxcLXxtM3xtNSl8dHhcXC05fHVwKFxcLmJ8ZzF8c2kpfHV0c3R8djQwMHx2NzUwfHZlcml8dmkocmd8dGUpfHZrKDQwfDVbMC0zXXxcXC12KXx2bTQwfHZvZGF8dnVsY3x2eCg1Mnw1M3w2MHw2MXw3MHw4MHw4MXw4M3w4NXw5OCl8dzNjKFxcLXwgKXx3ZWJjfHdoaXR8d2koZyB8bmN8bncpfHdtbGJ8d29udXx4NzAwfHlhc1xcLXx5b3VyfHpldG98enRlXFwtL2kudGVzdChhLnN1YnN0cigwLDQpKSljaGVjayA9IHRydWV9KShuYXZpZ2F0b3IudXNlckFnZW50fHxuYXZpZ2F0b3IudmVuZG9yfHx3aW5kb3cub3BlcmEpO1xuICAgIHJldHVybiBjaGVjaztcbn1cblxuZnVuY3Rpb24gaXNJb3MoKSB7XG4gICAgcmV0dXJuIC9pUGhvbmV8aVBhZHxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcbn1cblxuZnVuY3Rpb24gaXNSZWFsSXBob25lKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQb2QvaS50ZXN0KG5hdmlnYXRvci5wbGF0Zm9ybSk7XG59XG5cbi8vYWRvcHQgY29kZSBmcm9tOiBodHRwczovL2dpdGh1Yi5jb20vTW96VlIvdnItd2ViLWV4YW1wbGVzL2Jsb2IvbWFzdGVyL3RocmVlanMtdnItYm9pbGVycGxhdGUvanMvVlJFZmZlY3QuanNcbmZ1bmN0aW9uIGZvdlRvTkRDU2NhbGVPZmZzZXQoIGZvdiApIHtcbiAgICB2YXIgcHhzY2FsZSA9IDIuMCAvIChmb3YubGVmdFRhbiArIGZvdi5yaWdodFRhbik7XG4gICAgdmFyIHB4b2Zmc2V0ID0gKGZvdi5sZWZ0VGFuIC0gZm92LnJpZ2h0VGFuKSAqIHB4c2NhbGUgKiAwLjU7XG4gICAgdmFyIHB5c2NhbGUgPSAyLjAgLyAoZm92LnVwVGFuICsgZm92LmRvd25UYW4pO1xuICAgIHZhciBweW9mZnNldCA9IChmb3YudXBUYW4gLSBmb3YuZG93blRhbikgKiBweXNjYWxlICogMC41O1xuICAgIHJldHVybiB7IHNjYWxlOiBbIHB4c2NhbGUsIHB5c2NhbGUgXSwgb2Zmc2V0OiBbIHB4b2Zmc2V0LCBweW9mZnNldCBdIH07XG59XG5cbmZ1bmN0aW9uIGZvdlBvcnRUb1Byb2plY3Rpb24oIGZvdiwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICkge1xuXG4gICAgcmlnaHRIYW5kZWQgPSByaWdodEhhbmRlZCA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IHJpZ2h0SGFuZGVkO1xuICAgIHpOZWFyID0gek5lYXIgPT09IHVuZGVmaW5lZCA/IDAuMDEgOiB6TmVhcjtcbiAgICB6RmFyID0gekZhciA9PT0gdW5kZWZpbmVkID8gMTAwMDAuMCA6IHpGYXI7XG5cbiAgICB2YXIgaGFuZGVkbmVzc1NjYWxlID0gcmlnaHRIYW5kZWQgPyAtMS4wIDogMS4wO1xuXG4gICAgLy8gc3RhcnQgd2l0aCBhbiBpZGVudGl0eSBtYXRyaXhcbiAgICB2YXIgbW9iaiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gICAgdmFyIG0gPSBtb2JqLmVsZW1lbnRzO1xuXG4gICAgLy8gYW5kIHdpdGggc2NhbGUvb2Zmc2V0IGluZm8gZm9yIG5vcm1hbGl6ZWQgZGV2aWNlIGNvb3Jkc1xuICAgIHZhciBzY2FsZUFuZE9mZnNldCA9IGZvdlRvTkRDU2NhbGVPZmZzZXQoZm92KTtcblxuICAgIC8vIFggcmVzdWx0LCBtYXAgY2xpcCBlZGdlcyB0byBbLXcsK3ddXG4gICAgbVswICogNCArIDBdID0gc2NhbGVBbmRPZmZzZXQuc2NhbGVbMF07XG4gICAgbVswICogNCArIDFdID0gMC4wO1xuICAgIG1bMCAqIDQgKyAyXSA9IHNjYWxlQW5kT2Zmc2V0Lm9mZnNldFswXSAqIGhhbmRlZG5lc3NTY2FsZTtcbiAgICBtWzAgKiA0ICsgM10gPSAwLjA7XG5cbiAgICAvLyBZIHJlc3VsdCwgbWFwIGNsaXAgZWRnZXMgdG8gWy13LCt3XVxuICAgIC8vIFkgb2Zmc2V0IGlzIG5lZ2F0ZWQgYmVjYXVzZSB0aGlzIHByb2ogbWF0cml4IHRyYW5zZm9ybXMgZnJvbSB3b3JsZCBjb29yZHMgd2l0aCBZPXVwLFxuICAgIC8vIGJ1dCB0aGUgTkRDIHNjYWxpbmcgaGFzIFk9ZG93biAodGhhbmtzIEQzRD8pXG4gICAgbVsxICogNCArIDBdID0gMC4wO1xuICAgIG1bMSAqIDQgKyAxXSA9IHNjYWxlQW5kT2Zmc2V0LnNjYWxlWzFdO1xuICAgIG1bMSAqIDQgKyAyXSA9IC1zY2FsZUFuZE9mZnNldC5vZmZzZXRbMV0gKiBoYW5kZWRuZXNzU2NhbGU7XG4gICAgbVsxICogNCArIDNdID0gMC4wO1xuXG4gICAgLy8gWiByZXN1bHQgKHVwIHRvIHRoZSBhcHApXG4gICAgbVsyICogNCArIDBdID0gMC4wO1xuICAgIG1bMiAqIDQgKyAxXSA9IDAuMDtcbiAgICBtWzIgKiA0ICsgMl0gPSB6RmFyIC8gKHpOZWFyIC0gekZhcikgKiAtaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMiAqIDQgKyAzXSA9ICh6RmFyICogek5lYXIpIC8gKHpOZWFyIC0gekZhcik7XG5cbiAgICAvLyBXIHJlc3VsdCAoPSBaIGluKVxuICAgIG1bMyAqIDQgKyAwXSA9IDAuMDtcbiAgICBtWzMgKiA0ICsgMV0gPSAwLjA7XG4gICAgbVszICogNCArIDJdID0gaGFuZGVkbmVzc1NjYWxlO1xuICAgIG1bMyAqIDQgKyAzXSA9IDAuMDtcblxuICAgIG1vYmoudHJhbnNwb3NlKCk7XG5cbiAgICByZXR1cm4gbW9iajtcbn1cblxuZnVuY3Rpb24gZm92VG9Qcm9qZWN0aW9uKCBmb3YsIHJpZ2h0SGFuZGVkLCB6TmVhciwgekZhciApIHtcbiAgICB2YXIgREVHMlJBRCA9IE1hdGguUEkgLyAxODAuMDtcblxuICAgIHZhciBmb3ZQb3J0ID0ge1xuICAgICAgICB1cFRhbjogTWF0aC50YW4oIGZvdi51cERlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIGRvd25UYW46IE1hdGgudGFuKCBmb3YuZG93bkRlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIGxlZnRUYW46IE1hdGgudGFuKCBmb3YubGVmdERlZ3JlZXMgKiBERUcyUkFEICksXG4gICAgICAgIHJpZ2h0VGFuOiBNYXRoLnRhbiggZm92LnJpZ2h0RGVncmVlcyAqIERFRzJSQUQgKVxuICAgIH07XG5cbiAgICByZXR1cm4gZm92UG9ydFRvUHJvamVjdGlvbiggZm92UG9ydCwgcmlnaHRIYW5kZWQsIHpOZWFyLCB6RmFyICk7XG59XG5cbmZ1bmN0aW9uIGV4dGVuZChmcm9tLCB0bylcbntcbiAgICBpZiAoZnJvbSA9PSBudWxsIHx8IHR5cGVvZiBmcm9tICE9IFwib2JqZWN0XCIpIHJldHVybiBmcm9tO1xuICAgIGlmIChmcm9tLmNvbnN0cnVjdG9yICE9IE9iamVjdCAmJiBmcm9tLmNvbnN0cnVjdG9yICE9IEFycmF5KSByZXR1cm4gZnJvbTtcbiAgICBpZiAoZnJvbS5jb25zdHJ1Y3RvciA9PSBEYXRlIHx8IGZyb20uY29uc3RydWN0b3IgPT0gUmVnRXhwIHx8IGZyb20uY29uc3RydWN0b3IgPT0gRnVuY3Rpb24gfHxcbiAgICAgICAgZnJvbS5jb25zdHJ1Y3RvciA9PSBTdHJpbmcgfHwgZnJvbS5jb25zdHJ1Y3RvciA9PSBOdW1iZXIgfHwgZnJvbS5jb25zdHJ1Y3RvciA9PSBCb29sZWFuKVxuICAgICAgICByZXR1cm4gbmV3IGZyb20uY29uc3RydWN0b3IoZnJvbSk7XG5cbiAgICB0byA9IHRvIHx8IG5ldyBmcm9tLmNvbnN0cnVjdG9yKCk7XG5cbiAgICBmb3IgKHZhciBuYW1lIGluIGZyb20pXG4gICAge1xuICAgICAgICB0b1tuYW1lXSA9IHR5cGVvZiB0b1tuYW1lXSA9PSBcInVuZGVmaW5lZFwiID8gZXh0ZW5kKGZyb21bbmFtZV0sIG51bGwpIDogdG9bbmFtZV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICB3aGljaFRyYW5zaXRpb25FdmVudDogd2hpY2hUcmFuc2l0aW9uRXZlbnQsXG4gICAgbW9iaWxlQW5kVGFibGV0Y2hlY2s6IG1vYmlsZUFuZFRhYmxldGNoZWNrLFxuICAgIGlzSW9zOiBpc0lvcyxcbiAgICBpc1JlYWxJcGhvbmU6IGlzUmVhbElwaG9uZSxcbiAgICBmb3ZUb1Byb2plY3Rpb246IGZvdlRvUHJvamVjdGlvbixcbiAgICBleHRlbmQ6IGV4dGVuZFxufTsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDgvMTMvMTYuXG4gKi9cblxudmFyIFZSQnV0dG9uID0gZnVuY3Rpb24oQnV0dG9uQ29tcG9uZW50KXtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgQnV0dG9uQ29tcG9uZW50LmNhbGwodGhpcywgcGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSxcblxuICAgICAgICBidWlsZENTU0NsYXNzOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBgdmpzLVZSLWNvbnRyb2wgJHtCdXR0b25Db21wb25lbnQucHJvdG90eXBlLmJ1aWxkQ1NTQ2xhc3MuY2FsbCh0aGlzKX1gO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZUNsaWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgY2FudmFzID0gdGhpcy5wbGF5ZXIoKS5nZXRDaGlsZChcIkNhbnZhc1wiKTtcbiAgICAgICAgICAgICghY2FudmFzLlZSTW9kZSk/IGNhbnZhcy5lbmFibGVWUigpIDogY2FudmFzLmRpc2FibGVWUigpO1xuICAgICAgICAgICAgKGNhbnZhcy5WUk1vZGUpPyB0aGlzLmFkZENsYXNzKFwiZW5hYmxlXCIpIDogdGhpcy5yZW1vdmVDbGFzcyhcImVuYWJsZVwiKTtcbiAgICAgICAgfSxcblxuICAgICAgICBjb250cm9sVGV4dF86IFwiVlJcIlxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gVlJCdXR0b247IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzMvMTYuXG4gKi9cbid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IHV0aWwgZnJvbSAnLi9saWIvVXRpbCc7XG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi9saWIvRGV0ZWN0b3InO1xuaW1wb3J0IG1ha2VWaWRlb1BsYXlhYmxlSW5saW5lIGZyb20gJ2lwaG9uZS1pbmxpbmUtdmlkZW8nO1xuXG5jb25zdCBydW5Pbk1vYmlsZSA9ICh1dGlsLm1vYmlsZUFuZFRhYmxldGNoZWNrKCkpO1xuXG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHRoZSBwbHVnaW4uXG5jb25zdCBkZWZhdWx0cyA9IHtcbiAgICBjbGlja0FuZERyYWc6IHJ1bk9uTW9iaWxlLFxuICAgIHNob3dOb3RpY2U6IHRydWUsXG4gICAgTm90aWNlTWVzc2FnZTogXCJQbGVhc2UgdXNlIHlvdXIgbW91c2UgZHJhZyBhbmQgZHJvcCB0aGUgdmlkZW8uXCIsXG4gICAgYXV0b0hpZGVOb3RpY2U6IDMwMDAsXG4gICAgLy9saW1pdCB0aGUgdmlkZW8gc2l6ZSB3aGVuIHVzZXIgc2Nyb2xsLlxuICAgIHNjcm9sbGFibGU6IHRydWUsXG4gICAgaW5pdEZvdjogNzUsXG4gICAgbWF4Rm92OiAxMDUsXG4gICAgbWluRm92OiA1MSxcbiAgICAvL2luaXRpYWwgcG9zaXRpb24gZm9yIHRoZSB2aWRlb1xuICAgIGluaXRMYXQ6IDAsXG4gICAgaW5pdExvbjogLTE4MCxcbiAgICAvL0EgZmxvYXQgdmFsdWUgYmFjayB0byBjZW50ZXIgd2hlbiBtb3VzZSBvdXQgdGhlIGNhbnZhcy4gVGhlIGhpZ2hlciwgdGhlIGZhc3Rlci5cbiAgICByZXR1cm5TdGVwTGF0OiAwLjUsXG4gICAgcmV0dXJuU3RlcExvbjogMixcbiAgICBiYWNrVG9WZXJ0aWNhbENlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGJhY2tUb0hvcml6b25DZW50ZXI6ICFydW5Pbk1vYmlsZSxcbiAgICBjbGlja1RvVG9nZ2xlOiBmYWxzZSxcbiAgICBcbiAgICAvL2xpbWl0IHZpZXdhYmxlIHpvb21cbiAgICBtaW5MYXQ6IC04NSxcbiAgICBtYXhMYXQ6IDg1LFxuXG4gICAgbWluTG9uOiAtSW5maW5pdHksXG4gICAgbWF4TG9uOiBJbmZpbml0eSxcblxuICAgIHZpZGVvVHlwZTogXCJlcXVpcmVjdGFuZ3VsYXJcIixcbiAgICBcbiAgICByb3RhdGVYOiAwLFxuICAgIHJvdGF0ZVk6IDAsXG4gICAgcm90YXRlWjogMCxcbiAgICBcbiAgICBhdXRvTW9iaWxlT3JpZW50YXRpb246IGZhbHNlLFxuICAgIG1vYmlsZVZpYnJhdGlvblZhbHVlOiB1dGlsLmlzSW9zKCk/IDAuMDIyIDogMSxcblxuICAgIFZSRW5hYmxlOiB0cnVlLFxuICAgIFZSR2FwRGVncmVlOiAyLjVcbn07XG5cbmZ1bmN0aW9uIHBsYXllclJlc2l6ZShwbGF5ZXIpe1xuICAgIHZhciBjYW52YXMgPSBwbGF5ZXIuZ2V0Q2hpbGQoJ0NhbnZhcycpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHBsYXllci5lbCgpLnN0eWxlLndpZHRoID0gd2luZG93LmlubmVyV2lkdGggKyBcInB4XCI7XG4gICAgICAgIHBsYXllci5lbCgpLnN0eWxlLmhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodCArIFwicHhcIjtcbiAgICAgICAgY2FudmFzLmhhbmRsZVJlc2l6ZSgpO1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIGZ1bGxzY3JlZW5PbklPUyhwbGF5ZXIsIGNsaWNrRm4pIHtcbiAgICB2YXIgcmVzaXplRm4gPSBwbGF5ZXJSZXNpemUocGxheWVyKTtcbiAgICBwbGF5ZXIuY29udHJvbEJhci5mdWxsc2NyZWVuVG9nZ2xlLm9mZihcInRhcFwiLCBjbGlja0ZuKTtcbiAgICBwbGF5ZXIuY29udHJvbEJhci5mdWxsc2NyZWVuVG9nZ2xlLm9uKFwidGFwXCIsIGZ1bmN0aW9uIGZ1bGxzY3JlZW4oKSB7XG4gICAgICAgIHZhciBjYW52YXMgPSBwbGF5ZXIuZ2V0Q2hpbGQoJ0NhbnZhcycpO1xuICAgICAgICBpZighcGxheWVyLmlzRnVsbHNjcmVlbigpKXtcbiAgICAgICAgICAgIC8vc2V0IHRvIGZ1bGxzY3JlZW5cbiAgICAgICAgICAgIHBsYXllci5pc0Z1bGxzY3JlZW4odHJ1ZSk7XG4gICAgICAgICAgICBwbGF5ZXIuZW50ZXJGdWxsV2luZG93KCk7XG4gICAgICAgICAgICByZXNpemVGbigpO1xuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJkZXZpY2Vtb3Rpb25cIiwgcmVzaXplRm4pO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHBsYXllci5pc0Z1bGxzY3JlZW4oZmFsc2UpO1xuICAgICAgICAgICAgcGxheWVyLmV4aXRGdWxsV2luZG93KCk7XG4gICAgICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS53aWR0aCA9IFwiXCI7XG4gICAgICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS5oZWlnaHQgPSBcIlwiO1xuICAgICAgICAgICAgY2FudmFzLmhhbmRsZVJlc2l6ZSgpO1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJkZXZpY2Vtb3Rpb25cIiwgcmVzaXplRm4pO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbi8qKlxuICogRnVuY3Rpb24gdG8gaW52b2tlIHdoZW4gdGhlIHBsYXllciBpcyByZWFkeS5cbiAqXG4gKiBUaGlzIGlzIGEgZ3JlYXQgcGxhY2UgZm9yIHlvdXIgcGx1Z2luIHRvIGluaXRpYWxpemUgaXRzZWxmLiBXaGVuIHRoaXNcbiAqIGZ1bmN0aW9uIGlzIGNhbGxlZCwgdGhlIHBsYXllciB3aWxsIGhhdmUgaXRzIERPTSBhbmQgY2hpbGQgY29tcG9uZW50c1xuICogaW4gcGxhY2UuXG4gKlxuICogQGZ1bmN0aW9uIG9uUGxheWVyUmVhZHlcbiAqIEBwYXJhbSAgICB7UGxheWVyfSBwbGF5ZXJcbiAqIEBwYXJhbSAgICB7T2JqZWN0fSBbb3B0aW9ucz17fV1cbiAqL1xuY29uc3Qgb25QbGF5ZXJSZWFkeSA9IChwbGF5ZXIsIG9wdGlvbnMsIHNldHRpbmdzKSA9PiB7XG4gICAgcGxheWVyLmFkZENsYXNzKCd2anMtcGFub3JhbWEnKTtcbiAgICBpZighRGV0ZWN0b3Iud2ViZ2wpe1xuICAgICAgICBQb3B1cE5vdGlmaWNhdGlvbihwbGF5ZXIsIHtcbiAgICAgICAgICAgIE5vdGljZU1lc3NhZ2U6IERldGVjdG9yLmdldFdlYkdMRXJyb3JNZXNzYWdlKCksXG4gICAgICAgICAgICBhdXRvSGlkZU5vdGljZTogb3B0aW9ucy5hdXRvSGlkZU5vdGljZVxuICAgICAgICB9KTtcbiAgICAgICAgaWYob3B0aW9ucy5jYWxsYmFjayl7XG4gICAgICAgICAgICBvcHRpb25zLmNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBwbGF5ZXIuYWRkQ2hpbGQoJ0NhbnZhcycsIHV0aWwuZXh0ZW5kKG9wdGlvbnMpKTtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICBpZihydW5Pbk1vYmlsZSl7XG4gICAgICAgIHZhciB2aWRlb0VsZW1lbnQgPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgIGlmKHV0aWwuaXNSZWFsSXBob25lKCkpe1xuICAgICAgICAgICAgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUodmlkZW9FbGVtZW50LCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBpZih1dGlsLmlzSW9zKCkpe1xuICAgICAgICAgICAgZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgc2V0dGluZ3MuZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSk7XG4gICAgICAgIH1cbiAgICAgICAgcGxheWVyLmFkZENsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW9cIik7XG4gICAgICAgIHBsYXllci5yZW1vdmVDbGFzcyhcInZqcy11c2luZy1uYXRpdmUtY29udHJvbHNcIik7XG4gICAgICAgIGNhbnZhcy5wbGF5T25Nb2JpbGUoKTtcbiAgICB9XG4gICAgaWYob3B0aW9ucy5zaG93Tm90aWNlKXtcbiAgICAgICAgcGxheWVyLm9uKFwicGxheWluZ1wiLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCB1dGlsLmV4dGVuZChvcHRpb25zKSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpZihvcHRpb25zLlZSRW5hYmxlKXtcbiAgICAgICAgcGxheWVyLmNvbnRyb2xCYXIuYWRkQ2hpbGQoJ1ZSQnV0dG9uJywge30sIHBsYXllci5jb250cm9sQmFyLmNoaWxkcmVuKCkubGVuZ3RoIC0gMSk7XG4gICAgfVxuICAgIGNhbnZhcy5oaWRlKCk7XG4gICAgcGxheWVyLm9uKFwicGxheVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5zaG93KCk7XG4gICAgfSk7XG4gICAgcGxheWVyLm9uKFwiZnVsbHNjcmVlbmNoYW5nZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IFBvcHVwTm90aWZpY2F0aW9uID0gKHBsYXllciwgb3B0aW9ucyA9IHtcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlwiXG59KSA9PiB7XG4gICAgdmFyIG5vdGljZSA9IHBsYXllci5hZGRDaGlsZCgnTm90aWNlJywgb3B0aW9ucyk7XG5cbiAgICBpZihvcHRpb25zLmF1dG9IaWRlTm90aWNlID4gMCl7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbm90aWNlLmFkZENsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgdmFyIHRyYW5zaXRpb25FdmVudCA9IHV0aWwud2hpY2hUcmFuc2l0aW9uRXZlbnQoKTtcbiAgICAgICAgICAgIHZhciBoaWRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgbm90aWNlLnJlbW92ZUNsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5vZmYodHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBub3RpY2Uub24odHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgfSwgb3B0aW9ucy5hdXRvSGlkZU5vdGljZSk7XG4gICAgfVxufTtcblxuY29uc3QgcGx1Z2luID0gZnVuY3Rpb24oc2V0dGluZ3MgPSB7fSl7XG4gICAgLyoqXG4gICAgICogQSB2aWRlby5qcyBwbHVnaW4uXG4gICAgICpcbiAgICAgKiBJbiB0aGUgcGx1Z2luIGZ1bmN0aW9uLCB0aGUgdmFsdWUgb2YgYHRoaXNgIGlzIGEgdmlkZW8uanMgYFBsYXllcmBcbiAgICAgKiBpbnN0YW5jZS4gWW91IGNhbm5vdCByZWx5IG9uIHRoZSBwbGF5ZXIgYmVpbmcgaW4gYSBcInJlYWR5XCIgc3RhdGUgaGVyZSxcbiAgICAgKiBkZXBlbmRpbmcgb24gaG93IHRoZSBwbHVnaW4gaXMgaW52b2tlZC4gVGhpcyBtYXkgb3IgbWF5IG5vdCBiZSBpbXBvcnRhbnRcbiAgICAgKiB0byB5b3U7IGlmIG5vdCwgcmVtb3ZlIHRoZSB3YWl0IGZvciBcInJlYWR5XCIhXG4gICAgICpcbiAgICAgKiBAZnVuY3Rpb24gcGFub3JhbWFcbiAgICAgKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gICAgICogICAgICAgICAgIEFuIG9iamVjdCBvZiBvcHRpb25zIGxlZnQgdG8gdGhlIHBsdWdpbiBhdXRob3IgdG8gZGVmaW5lLlxuICAgICAqL1xuICAgIGNvbnN0IHZpZGVvVHlwZXMgPSBbXCJlcXVpcmVjdGFuZ3VsYXJcIiwgXCJmaXNoZXllXCJdO1xuICAgIGNvbnN0IHBhbm9yYW1hID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICBpZihzZXR0aW5ncy5tZXJnZU9wdGlvbikgb3B0aW9ucyA9IHNldHRpbmdzLm1lcmdlT3B0aW9uKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICAgICAgaWYodmlkZW9UeXBlcy5pbmRleE9mKG9wdGlvbnMudmlkZW9UeXBlKSA9PSAtMSkgZGVmYXVsdHMudmlkZW9UeXBlO1xuICAgICAgICB0aGlzLnJlYWR5KCgpID0+IHtcbiAgICAgICAgICAgIG9uUGxheWVyUmVhZHkodGhpcywgb3B0aW9ucywgc2V0dGluZ3MpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4vLyBJbmNsdWRlIHRoZSB2ZXJzaW9uIG51bWJlci5cbiAgICBwYW5vcmFtYS5WRVJTSU9OID0gJzAuMC43JztcblxuICAgIHJldHVybiBwYW5vcmFtYTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgcGx1Z2luO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgQ2FudmFzICBmcm9tICcuL2xpYi9DYW52YXMnO1xuaW1wb3J0IE5vdGljZSAgZnJvbSAnLi9saWIvTm90aWNlJztcbmltcG9ydCBIZWxwZXJDYW52YXMgZnJvbSAnLi9saWIvSGVscGVyQ2FudmFzJztcbmltcG9ydCBWUkJ1dHRvbiBmcm9tICcuL2xpYi9WUkJ1dHRvbic7XG5pbXBvcnQgcGFub3JhbWEgZnJvbSAnLi9wbHVnaW4nO1xuXG5mdW5jdGlvbiBnZXRUZWNoKHBsYXllcikge1xuICAgIHJldHVybiBwbGF5ZXIudGVjaD8gcGxheWVyLnRlY2guZWwoKTpcbiAgICAgICAgcGxheWVyLmguZWwoKTtcbn1cblxuZnVuY3Rpb24gZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSB7XG4gICAgcmV0dXJuIHBsYXllci5jb250cm9sQmFyLmZ1bGxzY3JlZW5Ub2dnbGUub25DbGljayB8fCBwbGF5ZXIuY29udHJvbEJhci5mdWxsc2NyZWVuVG9nZ2xlLnU7XG59XG5cbnZhciBjb21wb25lbnQgPSB2aWRlb2pzLkNvbXBvbmVudDtcbnZhciBjb21wYXRpYWJsZUluaXRpYWxGdW5jdGlvbiA9IGZ1bmN0aW9uIChwbGF5ZXIsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmNvbnN0cnVjdG9yKHBsYXllciwgb3B0aW9ucyk7XG59O1xudmFyIGNhbnZhcyA9IENhbnZhcyhjb21wb25lbnQsIHtcbiAgICBnZXRUZWNoOiBnZXRUZWNoXG59KTtcbmNhbnZhcy5pbml0ID0gY29tcGF0aWFibGVJbml0aWFsRnVuY3Rpb247XG52aWRlb2pzLkNhbnZhcyA9IGNvbXBvbmVudC5leHRlbmQoY2FudmFzKTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xubm90aWNlLmluaXQgPSBjb21wYXRpYWJsZUluaXRpYWxGdW5jdGlvbjtcbnZpZGVvanMuTm90aWNlID0gY29tcG9uZW50LmV4dGVuZChub3RpY2UpO1xuXG52YXIgaGVscGVyQ2FudmFzID0gSGVscGVyQ2FudmFzKGNvbXBvbmVudCk7XG5oZWxwZXJDYW52YXMuaW5pdCA9IGNvbXBhdGlhYmxlSW5pdGlhbEZ1bmN0aW9uO1xudmlkZW9qcy5IZWxwZXJDYW52YXMgPSBjb21wb25lbnQuZXh0ZW5kKGhlbHBlckNhbnZhcyk7XG5cbnZhciBidXR0b24gPSB2aWRlb2pzLkJ1dHRvbjtcbnZhciB2ckJ0biA9IFZSQnV0dG9uKGJ1dHRvbik7XG52ckJ0bi5pbml0ID0gY29tcGF0aWFibGVJbml0aWFsRnVuY3Rpb247XG52ckJ0bi5vbkNsaWNrID0gdnJCdG4udSA9IHZyQnRuLmhhbmRsZUNsaWNrO1xudnJCdG4uYnV0dG9uVGV4dCA9IHZyQnRuLnRhID0gdnJCdG4uY29udHJvbFRleHRfO1xudnJCdG4uVCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gYHZqcy1WUi1jb250cm9sICR7YnV0dG9uLnByb3RvdHlwZS5ULmNhbGwodGhpcyl9YDtcbn07XG52aWRlb2pzLlZSQnV0dG9uID0gYnV0dG9uLmV4dGVuZCh2ckJ0bik7XG5cbi8vIFJlZ2lzdGVyIHRoZSBwbHVnaW4gd2l0aCB2aWRlby5qcy5cbnZpZGVvanMucGx1Z2luKCdwYW5vcmFtYScsIHBhbm9yYW1hKHtcbiAgICBtZXJnZU9wdGlvbjogZnVuY3Rpb24gKGRlZmF1bHRzLCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiB2aWRlb2pzLnV0aWwubWVyZ2VPcHRpb25zKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICB9LFxuICAgIGdldFRlY2g6IGdldFRlY2gsXG4gICAgZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm46IGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuXG59KSk7XG4iXX0=
