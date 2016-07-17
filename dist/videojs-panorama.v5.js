(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

function Intervalometer(cb) {
	var rafId = void 0;
	var previousLoopTime = void 0;
	function loop(now) {
		// must be requested before cb() because that might call .stop()
		rafId = requestAnimationFrame(loop);
		cb(now - (previousLoopTime || now)); // ms since last call. 0 on start()
		previousLoopTime = now;
	}
	this.start = function () {
		if (!rafId) {
			// prevent double starts
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

	Object.defineProperty(object, propertyName, { get: get, set: set });
}

/*
File imported from: https://github.com/bfred-it/poor-mans-symbol
Until I configure rollup to import external libs into the IIFE bundle
*/

var _Symbol = typeof Symbol === 'undefined' ? function (description) {
	return '@' + (description || '@') + Math.random();
} : Symbol;

var isNeeded = /iPhone|iPod/i.test(navigator.userAgent);

var ಠ = _Symbol();
var ಠevent = _Symbol();
var ಠplay = _Symbol('nativeplay');
var ಠpause = _Symbol('nativepause');

/**
 * UTILS
 */

function getAudioFromVideo(video) {
	var audio = new Audio();
	audio.src = video.currentSrc || video.src;
	audio.crossOrigin = video.crossOrigin;
	return audio;
}

var lastRequests = [];
lastRequests.i = 0;

function setTime(video, time) {
	// allow one timeupdate event every 200+ ms
	if ((lastRequests.tue || 0) + 200 < Date.now()) {
		video[ಠevent] = true;
		lastRequests.tue = Date.now();
	}
	video.currentTime = time;
	lastRequests[++lastRequests.i % 3] = time * 100 | 0 / 100;
}

function isPlayerEnded(player) {
	return player.driver.currentTime >= player.video.duration;
}

function update(timeDiff) {
	// console.log('update');
	var player = this;
	if (player.video.readyState >= player.video.HAVE_FUTURE_DATA) {
		if (!player.hasAudio) {
			player.driver.currentTime = player.video.currentTime + timeDiff * player.video.playbackRate / 1000;
			if (player.video.loop && isPlayerEnded(player)) {
				player.driver.currentTime = 0;
			}
		}
		setTime(player.video, player.driver.currentTime);
	}

	// console.assert(player.video.currentTime === player.driver.currentTime, 'Video not updating!');

	if (player.video.ended) {
		player.video.pause(true);
	}
}

/**
 * METHODS
 */

function play() {
	// console.log('play')
	var video = this;
	var player = video[ಠ];

	// if it's fullscreen, the developer the native player
	if (video.webkitDisplayingFullscreen) {
		video[ಠplay]();
		return;
	}

	if (!video.paused) {
		return;
	}
	player.paused = false;

	if (!video.buffered.length) {
		video.load();
	}

	player.driver.play();
	player.updater.start();

	video.dispatchEvent(new Event('play'));

	// TODO: should be fired later
	video.dispatchEvent(new Event('playing'));
}
function pause(forceEvents) {
	// console.log('pause')
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
	video.dispatchEvent(new Event('pause'));
	if (video.ended) {
		video[ಠevent] = true;
		video.dispatchEvent(new Event('ended'));
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
		player.driver = {
			muted: true,
			paused: true,
			pause: function pause() {
				player.driver.paused = true;
			},
			play: function play() {
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
	// the alternative is .play()+.pause() but that triggers play/pause events, even worse
	// possibly the alternative is preventing this event only once
	video.addEventListener('emptied', function () {
		if (player.driver.src && player.driver.src !== video.currentSrc) {
			// console.log('src changed', video.currentSrc);
			setTime(video, 0);
			video.pause();
			player.driver.src = video.currentSrc;
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

function enableInlineVideo(video) {
	var hasAudio = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];
	var onlyWhenNeeded = arguments.length <= 2 || arguments[2] === undefined ? true : arguments[2];

	if (onlyWhenNeeded && !isNeeded || video[ಠ]) {
		return;
	}
	addPlayer(video, hasAudio);
	overloadAPI(video);
	video.classList.add('IIV');
	if (!hasAudio && video.autoplay) {
		video.play();
	}
}

module.exports = enableInlineVideo;
},{}],2:[function(require,module,exports){
'use strict';

var _Detector = require('../lib/Detector');

var _Detector2 = _interopRequireDefault(_Detector);

var _MobileBuffering = require('../lib/MobileBuffering');

var _MobileBuffering2 = _interopRequireDefault(_MobileBuffering);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Created by yanwsh on 4/3/16.
 */


var HAVE_ENOUGH_DATA = 4;

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

            if (window.matchMedia("(orientation: portrait)").matches) {
                this.lon = this.lon - y * this.settings.mobileVibrationValue;
                this.lat = this.lat + x * this.settings.mobileVibrationValue;
            } else if (window.matchMedia("(orientation: landscape)").matches) {
                var orientationDegree = -90;
                if (typeof window.orientation != "undefined") {
                    orientationDegree = window.orientation;
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
            this.renderer.render(this.scene, this.camera);
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

},{"../lib/Detector":3,"../lib/MobileBuffering":5}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
'use strict';

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

module.exports = {
    whichTransitionEvent: whichTransitionEvent,
    mobileAndTabletcheck: mobileAndTabletcheck,
    isIos: isIos,
    isRealIphone: isRealIphone
};

},{}],8:[function(require,module,exports){
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
    videoType: "equirectangular",

    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,

    autoMobileOrientation: false,
    mobileVibrationValue: _Util2.default.isIos() ? 0.022 : 1
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
    player.addChild('Canvas', options);
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
            PopupNotification(player, options);
        });
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

},{"./lib/Detector":3,"./lib/Util":7,"iphone-inline-video":1}],9:[function(require,module,exports){
'use strict';

var _Canvas = require('./lib/Canvas');

var _Canvas2 = _interopRequireDefault(_Canvas);

var _Notice = require('./lib/Notice');

var _Notice2 = _interopRequireDefault(_Notice);

var _HelperCanvas = require('./lib/HelperCanvas');

var _HelperCanvas2 = _interopRequireDefault(_HelperCanvas);

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
var canvas = (0, _Canvas2.default)(component, {
    getTech: getTech
});
videojs.registerComponent('Canvas', videojs.extend(component, canvas));

var notice = (0, _Notice2.default)(component);
videojs.registerComponent('Notice', videojs.extend(component, notice));

var helperCanvas = (0, _HelperCanvas2.default)(component);
videojs.registerComponent('HelperCanvas', videojs.extend(component, helperCanvas));

// Register the plugin with video.js.

videojs.plugin('panorama', (0, _plugin2.default)({
    mergeOption: function mergeOption(defaults, options) {
        return videojs.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));

},{"./lib/Canvas":2,"./lib/HelperCanvas":4,"./lib/Notice":6,"./plugin":8}]},{},[9])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y1LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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U0FBUCxDQUFUO0FBQ0osUUFBUSxpQkFBUixDQUEwQixRQUExQixFQUFvQyxRQUFRLE1BQVIsQ0FBZSxTQUFmLEVBQTBCLE1BQTFCLENBQXBDOztBQUVBLElBQUksZUFBZSw0QkFBYSxTQUFiLENBQWY7QUFDSixRQUFRLGlCQUFSLENBQTBCLGNBQTFCLEVBQTBDLFFBQVEsTUFBUixDQUFlLFNBQWYsRUFBMEIsWUFBMUIsQ0FBMUM7Ozs7QUFJQSxRQUFRLE1BQVIsQ0FBZSxVQUFmLEVBQTJCLHNCQUFTO0FBQ2hDLGlCQUFhLHFCQUFVLFFBQVYsRUFBb0IsT0FBcEIsRUFBNkI7QUFDdEMsZUFBTyxRQUFRLFlBQVIsQ0FBcUIsUUFBckIsRUFBK0IsT0FBL0IsQ0FBUCxDQURzQztLQUE3QjtBQUdiLGFBQVMsT0FBVDtBQUNBLGdDQUE0QiwwQkFBNUI7Q0FMdUIsQ0FBM0IiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBJbnRlcnZhbG9tZXRlcihjYikge1xuXHR2YXIgcmFmSWQgPSB2b2lkIDA7XG5cdHZhciBwcmV2aW91c0xvb3BUaW1lID0gdm9pZCAwO1xuXHRmdW5jdGlvbiBsb29wKG5vdykge1xuXHRcdC8vIG11c3QgYmUgcmVxdWVzdGVkIGJlZm9yZSBjYigpIGJlY2F1c2UgdGhhdCBtaWdodCBjYWxsIC5zdG9wKClcblx0XHRyYWZJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblx0XHRjYihub3cgLSAocHJldmlvdXNMb29wVGltZSB8fCBub3cpKTsgLy8gbXMgc2luY2UgbGFzdCBjYWxsLiAwIG9uIHN0YXJ0KClcblx0XHRwcmV2aW91c0xvb3BUaW1lID0gbm93O1xuXHR9XG5cdHRoaXMuc3RhcnQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCFyYWZJZCkge1xuXHRcdFx0Ly8gcHJldmVudCBkb3VibGUgc3RhcnRzXG5cdFx0XHRsb29wKDApO1xuXHRcdH1cblx0fTtcblx0dGhpcy5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHRcdGNhbmNlbEFuaW1hdGlvbkZyYW1lKHJhZklkKTtcblx0XHRyYWZJZCA9IG51bGw7XG5cdFx0cHJldmlvdXNMb29wVGltZSA9IDA7XG5cdH07XG59XG5cbmZ1bmN0aW9uIHByZXZlbnRFdmVudChlbGVtZW50LCBldmVudE5hbWUsIHRvZ2dsZVByb3BlcnR5LCBwcmV2ZW50V2l0aFByb3BlcnR5KSB7XG5cdGZ1bmN0aW9uIGhhbmRsZXIoZSkge1xuXHRcdGlmIChCb29sZWFuKGVsZW1lbnRbdG9nZ2xlUHJvcGVydHldKSA9PT0gQm9vbGVhbihwcmV2ZW50V2l0aFByb3BlcnR5KSkge1xuXHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdC8vIGNvbnNvbGUubG9nKGV2ZW50TmFtZSwgJ3ByZXZlbnRlZCBvbicsIGVsZW1lbnQpO1xuXHRcdH1cblx0XHRkZWxldGUgZWxlbWVudFt0b2dnbGVQcm9wZXJ0eV07XG5cdH1cblx0ZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgaGFuZGxlciwgZmFsc2UpO1xuXG5cdC8vIFJldHVybiBoYW5kbGVyIHRvIGFsbG93IHRvIGRpc2FibGUgdGhlIHByZXZlbnRpb24uIFVzYWdlOlxuXHQvLyBjb25zdCBwcmV2ZW50aW9uSGFuZGxlciA9IHByZXZlbnRFdmVudChlbCwgJ2NsaWNrJyk7XG5cdC8vIGVsLnJlbW92ZUV2ZW50SGFuZGxlcignY2xpY2snLCBwcmV2ZW50aW9uSGFuZGxlcik7XG5cdHJldHVybiBoYW5kbGVyO1xufVxuXG5mdW5jdGlvbiBwcm94eVByb3BlcnR5KG9iamVjdCwgcHJvcGVydHlOYW1lLCBzb3VyY2VPYmplY3QsIGNvcHlGaXJzdCkge1xuXHRmdW5jdGlvbiBnZXQoKSB7XG5cdFx0cmV0dXJuIHNvdXJjZU9iamVjdFtwcm9wZXJ0eU5hbWVdO1xuXHR9XG5cdGZ1bmN0aW9uIHNldCh2YWx1ZSkge1xuXHRcdHNvdXJjZU9iamVjdFtwcm9wZXJ0eU5hbWVdID0gdmFsdWU7XG5cdH1cblxuXHRpZiAoY29weUZpcnN0KSB7XG5cdFx0c2V0KG9iamVjdFtwcm9wZXJ0eU5hbWVdKTtcblx0fVxuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5TmFtZSwgeyBnZXQ6IGdldCwgc2V0OiBzZXQgfSk7XG59XG5cbi8qXG5GaWxlIGltcG9ydGVkIGZyb206IGh0dHBzOi8vZ2l0aHViLmNvbS9iZnJlZC1pdC9wb29yLW1hbnMtc3ltYm9sXG5VbnRpbCBJIGNvbmZpZ3VyZSByb2xsdXAgdG8gaW1wb3J0IGV4dGVybmFsIGxpYnMgaW50byB0aGUgSUlGRSBidW5kbGVcbiovXG5cbnZhciBfU3ltYm9sID0gdHlwZW9mIFN5bWJvbCA9PT0gJ3VuZGVmaW5lZCcgPyBmdW5jdGlvbiAoZGVzY3JpcHRpb24pIHtcblx0cmV0dXJuICdAJyArIChkZXNjcmlwdGlvbiB8fCAnQCcpICsgTWF0aC5yYW5kb20oKTtcbn0gOiBTeW1ib2w7XG5cbnZhciBpc05lZWRlZCA9IC9pUGhvbmV8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG5cbnZhciDgsqAgPSBfU3ltYm9sKCk7XG52YXIg4LKgZXZlbnQgPSBfU3ltYm9sKCk7XG52YXIg4LKgcGxheSA9IF9TeW1ib2woJ25hdGl2ZXBsYXknKTtcbnZhciDgsqBwYXVzZSA9IF9TeW1ib2woJ25hdGl2ZXBhdXNlJyk7XG5cbi8qKlxuICogVVRJTFNcbiAqL1xuXG5mdW5jdGlvbiBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbykge1xuXHR2YXIgYXVkaW8gPSBuZXcgQXVkaW8oKTtcblx0YXVkaW8uc3JjID0gdmlkZW8uY3VycmVudFNyYyB8fCB2aWRlby5zcmM7XG5cdGF1ZGlvLmNyb3NzT3JpZ2luID0gdmlkZW8uY3Jvc3NPcmlnaW47XG5cdHJldHVybiBhdWRpbztcbn1cblxudmFyIGxhc3RSZXF1ZXN0cyA9IFtdO1xubGFzdFJlcXVlc3RzLmkgPSAwO1xuXG5mdW5jdGlvbiBzZXRUaW1lKHZpZGVvLCB0aW1lKSB7XG5cdC8vIGFsbG93IG9uZSB0aW1ldXBkYXRlIGV2ZW50IGV2ZXJ5IDIwMCsgbXNcblx0aWYgKChsYXN0UmVxdWVzdHMudHVlIHx8IDApICsgMjAwIDwgRGF0ZS5ub3coKSkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0bGFzdFJlcXVlc3RzLnR1ZSA9IERhdGUubm93KCk7XG5cdH1cblx0dmlkZW8uY3VycmVudFRpbWUgPSB0aW1lO1xuXHRsYXN0UmVxdWVzdHNbKytsYXN0UmVxdWVzdHMuaSAlIDNdID0gdGltZSAqIDEwMCB8IDAgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIGlzUGxheWVyRW5kZWQocGxheWVyKSB7XG5cdHJldHVybiBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID49IHBsYXllci52aWRlby5kdXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gdXBkYXRlKHRpbWVEaWZmKSB7XG5cdC8vIGNvbnNvbGUubG9nKCd1cGRhdGUnKTtcblx0dmFyIHBsYXllciA9IHRoaXM7XG5cdGlmIChwbGF5ZXIudmlkZW8ucmVhZHlTdGF0ZSA+PSBwbGF5ZXIudmlkZW8uSEFWRV9GVVRVUkVfREFUQSkge1xuXHRcdGlmICghcGxheWVyLmhhc0F1ZGlvKSB7XG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gcGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lICsgdGltZURpZmYgKiBwbGF5ZXIudmlkZW8ucGxheWJhY2tSYXRlIC8gMTAwMDtcblx0XHRcdGlmIChwbGF5ZXIudmlkZW8ubG9vcCAmJiBpc1BsYXllckVuZGVkKHBsYXllcikpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNldFRpbWUocGxheWVyLnZpZGVvLCBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lKTtcblx0fVxuXG5cdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci52aWRlby5jdXJyZW50VGltZSA9PT0gcGxheWVyLmRyaXZlci5jdXJyZW50VGltZSwgJ1ZpZGVvIG5vdCB1cGRhdGluZyEnKTtcblxuXHRpZiAocGxheWVyLnZpZGVvLmVuZGVkKSB7XG5cdFx0cGxheWVyLnZpZGVvLnBhdXNlKHRydWUpO1xuXHR9XG59XG5cbi8qKlxuICogTUVUSE9EU1xuICovXG5cbmZ1bmN0aW9uIHBsYXkoKSB7XG5cdC8vIGNvbnNvbGUubG9nKCdwbGF5Jylcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB0aGUgZGV2ZWxvcGVyIHRoZSBuYXRpdmUgcGxheWVyXG5cdGlmICh2aWRlby53ZWJraXREaXNwbGF5aW5nRnVsbHNjcmVlbikge1xuXHRcdHZpZGVvW+CyoHBsYXldKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cGxheWVyLnBhdXNlZCA9IGZhbHNlO1xuXG5cdGlmICghdmlkZW8uYnVmZmVyZWQubGVuZ3RoKSB7XG5cdFx0dmlkZW8ubG9hZCgpO1xuXHR9XG5cblx0cGxheWVyLmRyaXZlci5wbGF5KCk7XG5cdHBsYXllci51cGRhdGVyLnN0YXJ0KCk7XG5cblx0dmlkZW8uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3BsYXknKSk7XG5cblx0Ly8gVE9ETzogc2hvdWxkIGJlIGZpcmVkIGxhdGVyXG5cdHZpZGVvLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdwbGF5aW5nJykpO1xufVxuZnVuY3Rpb24gcGF1c2UoZm9yY2VFdmVudHMpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BhdXNlJylcblx0dmFyIHZpZGVvID0gdGhpcztcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cblx0cGxheWVyLmRyaXZlci5wYXVzZSgpO1xuXHRwbGF5ZXIudXBkYXRlci5zdG9wKCk7XG5cblx0Ly8gaWYgaXQncyBmdWxsc2NyZWVuLCB0aGUgZGV2ZWxvcGVyIHRoZSBuYXRpdmUgcGxheWVyLnBhdXNlKClcblx0Ly8gVGhpcyBpcyBhdCB0aGUgZW5kIG9mIHBhdXNlKCkgYmVjYXVzZSBpdCBhbHNvXG5cdC8vIG5lZWRzIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBzaW11bGF0aW9uIGlzIHBhdXNlZFxuXHRpZiAodmlkZW8ud2Via2l0RGlzcGxheWluZ0Z1bGxzY3JlZW4pIHtcblx0XHR2aWRlb1vgsqBwYXVzZV0oKTtcblx0fVxuXG5cdGlmIChwbGF5ZXIucGF1c2VkICYmICFmb3JjZUV2ZW50cykge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHBsYXllci5wYXVzZWQgPSB0cnVlO1xuXHR2aWRlby5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgncGF1c2UnKSk7XG5cdGlmICh2aWRlby5lbmRlZCkge1xuXHRcdHZpZGVvW+CyoGV2ZW50XSA9IHRydWU7XG5cdFx0dmlkZW8uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2VuZGVkJykpO1xuXHR9XG59XG5cbi8qKlxuICogU0VUVVBcbiAqL1xuXG5mdW5jdGlvbiBhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdID0ge307XG5cdHBsYXllci5wYXVzZWQgPSB0cnVlOyAvLyB0cmFjayB3aGV0aGVyICdwYXVzZScgZXZlbnRzIGhhdmUgYmVlbiBmaXJlZFxuXHRwbGF5ZXIuaGFzQXVkaW8gPSBoYXNBdWRpbztcblx0cGxheWVyLnZpZGVvID0gdmlkZW87XG5cdHBsYXllci51cGRhdGVyID0gbmV3IEludGVydmFsb21ldGVyKHVwZGF0ZS5iaW5kKHBsYXllcikpO1xuXG5cdGlmIChoYXNBdWRpbykge1xuXHRcdHBsYXllci5kcml2ZXIgPSBnZXRBdWRpb0Zyb21WaWRlbyh2aWRlbyk7XG5cdH0gZWxzZSB7XG5cdFx0cGxheWVyLmRyaXZlciA9IHtcblx0XHRcdG11dGVkOiB0cnVlLFxuXHRcdFx0cGF1c2VkOiB0cnVlLFxuXHRcdFx0cGF1c2U6IGZ1bmN0aW9uIHBhdXNlKCkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBhdXNlZCA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0cGxheTogZnVuY3Rpb24gcGxheSgpIHtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5wYXVzZWQgPSBmYWxzZTtcblx0XHRcdFx0Ly8gbWVkaWEgYXV0b21hdGljYWxseSBnb2VzIHRvIDAgaWYgLnBsYXkoKSBpcyBjYWxsZWQgd2hlbiBpdCdzIGRvbmVcblx0XHRcdFx0aWYgKGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRcdHNldFRpbWUodmlkZW8sIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGVuZGVkKCkge1xuXHRcdFx0XHRyZXR1cm4gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyAubG9hZCgpIGNhdXNlcyB0aGUgZW1wdGllZCBldmVudFxuXHQvLyB0aGUgYWx0ZXJuYXRpdmUgaXMgLnBsYXkoKSsucGF1c2UoKSBidXQgdGhhdCB0cmlnZ2VycyBwbGF5L3BhdXNlIGV2ZW50cywgZXZlbiB3b3JzZVxuXHQvLyBwb3NzaWJseSB0aGUgYWx0ZXJuYXRpdmUgaXMgcHJldmVudGluZyB0aGlzIGV2ZW50IG9ubHkgb25jZVxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdlbXB0aWVkJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChwbGF5ZXIuZHJpdmVyLnNyYyAmJiBwbGF5ZXIuZHJpdmVyLnNyYyAhPT0gdmlkZW8uY3VycmVudFNyYykge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ3NyYyBjaGFuZ2VkJywgdmlkZW8uY3VycmVudFNyYyk7XG5cdFx0XHRzZXRUaW1lKHZpZGVvLCAwKTtcblx0XHRcdHZpZGVvLnBhdXNlKCk7XG5cdFx0XHRwbGF5ZXIuZHJpdmVyLnNyYyA9IHZpZGVvLmN1cnJlbnRTcmM7XG5cdFx0fVxuXHR9LCBmYWxzZSk7XG5cblx0Ly8gc3RvcCBwcm9ncmFtbWF0aWMgcGxheWVyIHdoZW4gT1MgdGFrZXMgb3ZlclxuXHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRiZWdpbmZ1bGxzY3JlZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF2aWRlby5wYXVzZWQpIHtcblx0XHRcdC8vIG1ha2Ugc3VyZSB0aGF0IHRoZSA8YXVkaW8+IGFuZCB0aGUgc3luY2VyL3VwZGF0ZXIgYXJlIHN0b3BwZWRcblx0XHRcdHZpZGVvLnBhdXNlKCk7XG5cblx0XHRcdC8vIHBsYXkgdmlkZW8gbmF0aXZlbHlcblx0XHRcdHZpZGVvW+CyoHBsYXldKCk7XG5cdFx0fSBlbHNlIGlmIChoYXNBdWRpbyAmJiAhcGxheWVyLmRyaXZlci5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHRcdC8vIGlmIHRoZSBmaXJzdCBwbGF5IGlzIG5hdGl2ZSxcblx0XHRcdC8vIHRoZSA8YXVkaW8+IG5lZWRzIHRvIGJlIGJ1ZmZlcmVkIG1hbnVhbGx5XG5cdFx0XHQvLyBzbyB3aGVuIHRoZSBmdWxsc2NyZWVuIGVuZHMsIGl0IGNhbiBiZSBzZXQgdG8gdGhlIHNhbWUgY3VycmVudCB0aW1lXG5cdFx0XHRwbGF5ZXIuZHJpdmVyLmxvYWQoKTtcblx0XHR9XG5cdH0pO1xuXHRpZiAoaGFzQXVkaW8pIHtcblx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRlbmRmdWxsc2NyZWVuJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gc3luYyBhdWRpbyB0byBuZXcgdmlkZW8gcG9zaXRpb25cblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSB2aWRlby5jdXJyZW50VGltZTtcblx0XHRcdC8vIGNvbnNvbGUuYXNzZXJ0KHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPT09IHZpZGVvLmN1cnJlbnRUaW1lLCAnQXVkaW8gbm90IHN5bmNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYWxsb3cgc2Vla2luZ1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3NlZWtpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAobGFzdFJlcXVlc3RzLmluZGV4T2YodmlkZW8uY3VycmVudFRpbWUgKiAxMDAgfCAwIC8gMTAwKSA8IDApIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ1VzZXItcmVxdWVzdGVkIHNlZWtpbmcnKTtcblx0XHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHZpZGVvLmN1cnJlbnRUaW1lO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG92ZXJsb2FkQVBJKHZpZGVvKSB7XG5cdHZhciBwbGF5ZXIgPSB2aWRlb1vgsqBdO1xuXHR2aWRlb1vgsqBwbGF5XSA9IHZpZGVvLnBsYXk7XG5cdHZpZGVvW+CyoHBhdXNlXSA9IHZpZGVvLnBhdXNlO1xuXHR2aWRlby5wbGF5ID0gcGxheTtcblx0dmlkZW8ucGF1c2UgPSBwYXVzZTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ3BhdXNlZCcsIHBsYXllci5kcml2ZXIpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnbXV0ZWQnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ3BsYXliYWNrUmF0ZScsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnZW5kZWQnLCBwbGF5ZXIuZHJpdmVyKTtcblx0cHJveHlQcm9wZXJ0eSh2aWRlbywgJ2xvb3AnLCBwbGF5ZXIuZHJpdmVyLCB0cnVlKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnc2Vla2luZycpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdzZWVrZWQnKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAndGltZXVwZGF0ZScsIOCyoGV2ZW50LCBmYWxzZSk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ2VuZGVkJywg4LKgZXZlbnQsIGZhbHNlKTsgLy8gcHJldmVudCBvY2Nhc2lvbmFsIG5hdGl2ZSBlbmRlZCBldmVudHNcbn1cblxuZnVuY3Rpb24gZW5hYmxlSW5saW5lVmlkZW8odmlkZW8pIHtcblx0dmFyIGhhc0F1ZGlvID0gYXJndW1lbnRzLmxlbmd0aCA8PSAxIHx8IGFyZ3VtZW50c1sxXSA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IGFyZ3VtZW50c1sxXTtcblx0dmFyIG9ubHlXaGVuTmVlZGVkID0gYXJndW1lbnRzLmxlbmd0aCA8PSAyIHx8IGFyZ3VtZW50c1syXSA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IGFyZ3VtZW50c1syXTtcblxuXHRpZiAob25seVdoZW5OZWVkZWQgJiYgIWlzTmVlZGVkIHx8IHZpZGVvW+CyoF0pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YWRkUGxheWVyKHZpZGVvLCBoYXNBdWRpbyk7XG5cdG92ZXJsb2FkQVBJKHZpZGVvKTtcblx0dmlkZW8uY2xhc3NMaXN0LmFkZCgnSUlWJyk7XG5cdGlmICghaGFzQXVkaW8gJiYgdmlkZW8uYXV0b3BsYXkpIHtcblx0XHR2aWRlby5wbGF5KCk7XG5cdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlbmFibGVJbmxpbmVWaWRlbzsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuaW1wb3J0IERldGVjdG9yIGZyb20gJy4uL2xpYi9EZXRlY3Rvcic7XG5pbXBvcnQgTW9iaWxlQnVmZmVyaW5nIGZyb20gJy4uL2xpYi9Nb2JpbGVCdWZmZXJpbmcnO1xuXG5jb25zdCBIQVZFX0VOT1VHSF9EQVRBID0gNDtcblxudmFyIENhbnZhcyA9IGZ1bmN0aW9uIChiYXNlQ29tcG9uZW50LCBzZXR0aW5ncyA9IHt9KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIGluaXQocGxheWVyLCBvcHRpb25zKXtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MgPSBvcHRpb25zO1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IHBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHBsYXllci5lbCgpLm9mZnNldEhlaWdodDtcbiAgICAgICAgICAgIHRoaXMubG9uID0gb3B0aW9ucy5pbml0TG9uLCB0aGlzLmxhdCA9IG9wdGlvbnMuaW5pdExhdCwgdGhpcy5waGkgPSAwLCB0aGlzLnRoZXRhID0gMDtcbiAgICAgICAgICAgIHRoaXMudmlkZW9UeXBlID0gb3B0aW9ucy52aWRlb1R5cGU7XG4gICAgICAgICAgICB0aGlzLmNsaWNrVG9Ub2dnbGUgPSBvcHRpb25zLmNsaWNrVG9Ub2dnbGU7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgLy9kZWZpbmUgc2NlbmVcbiAgICAgICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEob3B0aW9ucy5pbml0Rm92LCB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQsIDEsIDIwMDApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoIDAsIDAsIDAgKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIHJlbmRlclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYXV0b0NsZWFyID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoMHgwMDAwMDAsIDEpO1xuXG4gICAgICAgICAgICAvL2RlZmluZSB0ZXh0dXJlXG4gICAgICAgICAgICB2YXIgdmlkZW8gPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgICAgICB0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUgPSBEZXRlY3Rvci5zdXBwb3J0VmlkZW9UZXh0dXJlKCk7XG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhlbHBlckNhbnZhcyA9IHBsYXllci5hZGRDaGlsZChcIkhlbHBlckNhbnZhc1wiLCB7XG4gICAgICAgICAgICAgICAgICAgIHZpZGVvOiB2aWRlbyxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHRoaXMud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogdGhpcy5oZWlnaHRcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB2YXIgY29udGV4dCA9IHRoaXMuaGVscGVyQ2FudmFzLmVsKCk7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUoY29udGV4dCk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZSh2aWRlbyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZpZGVvLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcblxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5tYXhGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgLy9kZWZpbmUgZ2VvbWV0cnlcbiAgICAgICAgICAgIHZhciBnZW9tZXRyeSA9ICh0aGlzLnZpZGVvVHlwZSA9PT0gXCJlcXVpcmVjdGFuZ3VsYXJcIik/IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSg1MDAsIDYwLCA0MCk6IG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSggNTAwLCA2MCwgNDAgKS50b05vbkluZGV4ZWQoKTtcbiAgICAgICAgICAgIGlmKHRoaXMudmlkZW9UeXBlID09PSBcImZpc2hleWVcIil7XG4gICAgICAgICAgICAgICAgdmFyIG5vcm1hbHMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLm5vcm1hbC5hcnJheTtcbiAgICAgICAgICAgICAgICB2YXIgdXZzID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51di5hcnJheTtcbiAgICAgICAgICAgICAgICBmb3IgKCB2YXIgaSA9IDAsIGwgPSBub3JtYWxzLmxlbmd0aCAvIDM7IGkgPCBsOyBpICsrICkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IG5vcm1hbHNbIGkgKiAzICsgMCBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeSA9IG5vcm1hbHNbIGkgKiAzICsgMSBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeiA9IG5vcm1hbHNbIGkgKiAzICsgMiBdO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciByID0gTWF0aC5hc2luKE1hdGguc3FydCh4ICogeCArIHogKiB6KSAvIE1hdGguc3FydCh4ICogeCAgKyB5ICogeSArIHogKiB6KSkgLyBNYXRoLlBJO1xuICAgICAgICAgICAgICAgICAgICBpZih5IDwgMCkgciA9IDEgLSByO1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGhldGEgPSAoeCA9PSAwICYmIHogPT0gMCk/IDAgOiBNYXRoLmFjb3MoeCAvIE1hdGguc3FydCh4ICogeCArIHogKiB6KSk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHogPCAwKSB0aGV0YSA9IHRoZXRhICogLTE7XG4gICAgICAgICAgICAgICAgICAgIHV2c1sgaSAqIDIgKyAwIF0gPSAtMC44ICogciAqIE1hdGguY29zKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDEgXSA9IDAuOCAqIHIgKiBNYXRoLnNpbih0aGV0YSkgKyAwLjU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVgoIG9wdGlvbnMucm90YXRlWCk7XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWSggb3B0aW9ucy5yb3RhdGVZKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVaKCBvcHRpb25zLnJvdGF0ZVopO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ2VvbWV0cnkuc2NhbGUoIC0gMSwgMSwgMSApO1xuICAgICAgICAgICAgLy9kZWZpbmUgbWVzaFxuICAgICAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0aGlzLnRleHR1cmV9KVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vdGhpcy5tZXNoLnNjYWxlLnggPSAtMTtcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMubWVzaCk7XG4gICAgICAgICAgICB0aGlzLmVsXyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcbiAgICAgICAgICAgIHRoaXMuZWxfLmNsYXNzTGlzdC5hZGQoJ3Zqcy12aWRlby1jYW52YXMnKTtcblxuICAgICAgICAgICAgb3B0aW9ucy5lbCA9IHRoaXMuZWxfO1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHRoaXMuYXR0YWNoQ29udHJvbEV2ZW50cygpO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIoKS5vbihcInBsYXlcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuYW5pbWF0ZSgpO1xuICAgICAgICAgICAgfS5iaW5kKHRoaXMpKTtcblxuICAgICAgICAgICAgaWYob3B0aW9ucy5jYWxsYmFjaykgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGF0dGFjaENvbnRyb2xFdmVudHM6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZW1vdmUnLCB0aGlzLmhhbmRsZU1vdXNlTW92ZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNobW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2Vkb3duJywgdGhpcy5oYW5kbGVNb3VzZURvd24uYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaHN0YXJ0Jyx0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNldXAnLCB0aGlzLmhhbmRsZU1vdXNlVXAuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCd0b3VjaGVuZCcsIHRoaXMuaGFuZGxlTW91c2VVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3Muc2Nyb2xsYWJsZSl7XG4gICAgICAgICAgICAgICAgdGhpcy5vbignbW91c2V3aGVlbCcsIHRoaXMuaGFuZGxlTW91c2VXaGVlbC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgICAgICB0aGlzLm9uKCdNb3pNb3VzZVBpeGVsU2Nyb2xsJywgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5vbignbW91c2VlbnRlcicsIHRoaXMuaGFuZGxlTW91c2VFbnRlci5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbGVhdmUnLCB0aGlzLmhhbmRsZU1vdXNlTGVhc2UuYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlUmVzaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLndpZHRoID0gdGhpcy5wbGF5ZXIoKS5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHRoaXMucGxheWVyKCkuZWwoKS5vZmZzZXRIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB0aGlzLndpZHRoIC8gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUoIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0ICk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VVcDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSBmYWxzZTtcbiAgICAgICAgICAgIGlmKHRoaXMuY2xpY2tUb1RvZ2dsZSl7XG4gICAgICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICAgICAgdmFyIGNsaWVudFkgPSBldmVudC5jbGllbnRZIHx8IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICAgICAgdmFyIGRpZmZYID0gTWF0aC5hYnMoY2xpZW50WCAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYKTtcbiAgICAgICAgICAgICAgICB2YXIgZGlmZlkgPSBNYXRoLmFicyhjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkpO1xuICAgICAgICAgICAgICAgIGlmKGRpZmZYIDwgMC4xICYmIGRpZmZZIDwgMC4xKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllcigpLnBhdXNlZCgpID8gdGhpcy5wbGF5ZXIoKS5wbGF5KCkgOiB0aGlzLnBsYXllcigpLnBhdXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VEb3duOiBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm1vdXNlRG93biA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCA9IGNsaWVudFg7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWSA9IGNsaWVudFk7XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25Mb24gPSB0aGlzLmxvbjtcbiAgICAgICAgICAgIHRoaXMub25Qb2ludGVyRG93bkxhdCA9IHRoaXMubGF0O1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlTW92ZTogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIGNsaWVudFggPSBldmVudC5jbGllbnRYIHx8IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFk7XG4gICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmNsaWNrQW5kRHJhZyl7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5tb3VzZURvd24pe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICggdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclggLSBjbGllbnRYICkgKiAwLjIgKyB0aGlzLm9uUG9pbnRlckRvd25Mb247XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKCBjbGllbnRZIC0gdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkgKSAqIDAuMiArIHRoaXMub25Qb2ludGVyRG93bkxhdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnBhZ2VYIC0gdGhpcy5lbF8ub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgICAgICB2YXIgeSA9IGV2ZW50LnBhZ2VZIC0gdGhpcy5lbF8ub2Zmc2V0VG9wO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKHggLyB0aGlzLndpZHRoKSAqIDQzMCAtIDIyNTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICh5IC8gdGhpcy5oZWlnaHQpICogLTE4MCArIDkwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vYmlsZU9yaWVudGF0aW9uOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBldmVudC5yb3RhdGlvblJhdGUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcbiAgICAgICAgICAgIHZhciB4ID0gZXZlbnQucm90YXRpb25SYXRlLmFscGhhO1xuICAgICAgICAgICAgdmFyIHkgPSBldmVudC5yb3RhdGlvblJhdGUuYmV0YTtcblxuICAgICAgICAgICAgaWYgKHdpbmRvdy5tYXRjaE1lZGlhKFwiKG9yaWVudGF0aW9uOiBwb3J0cmFpdClcIikubWF0Y2hlcykge1xuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gdGhpcy5sb24gLSB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxhdCA9IHRoaXMubGF0ICsgeCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICB9ZWxzZSBpZih3aW5kb3cubWF0Y2hNZWRpYShcIihvcmllbnRhdGlvbjogbGFuZHNjYXBlKVwiKS5tYXRjaGVzKXtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50YXRpb25EZWdyZWUgPSAtOTA7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mIHdpbmRvdy5vcmllbnRhdGlvbiAhPSBcInVuZGVmaW5lZFwiKXtcbiAgICAgICAgICAgICAgICAgICAgb3JpZW50YXRpb25EZWdyZWUgPSB3aW5kb3cub3JpZW50YXRpb247XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5sb24gPSAob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKT8gdGhpcy5sb24gKyB4ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZSA6IHRoaXMubG9uIC0geCAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAob3JpZW50YXRpb25EZWdyZWUgPT0gLTkwKT8gdGhpcy5sYXQgKyB5ICogdGhpcy5zZXR0aW5ncy5tb2JpbGVWaWJyYXRpb25WYWx1ZSA6IHRoaXMubGF0IC0geSAqIHRoaXMuc2V0dGluZ3MubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbDogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgLy8gV2ViS2l0XG4gICAgICAgICAgICBpZiAoIGV2ZW50LndoZWVsRGVsdGFZICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhWSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gT3BlcmEgLyBFeHBsb3JlciA5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC53aGVlbERlbHRhICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiAtPSBldmVudC53aGVlbERlbHRhICogMC4wNTtcbiAgICAgICAgICAgICAgICAvLyBGaXJlZm94XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBldmVudC5kZXRhaWwgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ICs9IGV2ZW50LmRldGFpbCAqIDEuMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWluKHRoaXMuc2V0dGluZ3MubWF4Rm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuZm92ID0gTWF0aC5tYXgodGhpcy5zZXR0aW5ncy5taW5Gb3YsIHRoaXMuY2FtZXJhLmZvdik7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VFbnRlcjogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZUxlYXNlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBhbmltYXRlOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0QW5pbWF0aW9uSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoIHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpICk7XG4gICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIoKS5wYXVzZWQoKSl7XG4gICAgICAgICAgICAgICAgaWYodHlwZW9mKHRoaXMudGV4dHVyZSkgIT09IFwidW5kZWZpbmVkXCIgJiYgKCF0aGlzLmlzUGxheU9uTW9iaWxlICYmIHRoaXMucGxheWVyKCkucmVhZHlTdGF0ZSgpID09PSBIQVZFX0VOT1VHSF9EQVRBIHx8IHRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wbGF5aW5nXCIpKSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3QgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN0IC0gdGhpcy50aW1lID49IDMwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lID0gY3Q7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5pc1BsYXlPbk1vYmlsZSl7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudFRpbWUgPSB0aGlzLnBsYXllcigpLmN1cnJlbnRUaW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihNb2JpbGVCdWZmZXJpbmcuaXNCdWZmZXJpbmcoY3VycmVudFRpbWUpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighdGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkuYWRkQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYodGhpcy5wbGF5ZXIoKS5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2JpbGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyKCkucmVtb3ZlQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9iaWxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBpZighdGhpcy5pc1VzZXJJbnRlcmFjdGluZyl7XG4gICAgICAgICAgICAgICAgdmFyIHN5bWJvbExhdCA9ICh0aGlzLmxhdCA+IHRoaXMuc2V0dGluZ3MuaW5pdExhdCk/ICAtMSA6IDE7XG4gICAgICAgICAgICAgICAgdmFyIHN5bWJvbExvbiA9ICh0aGlzLmxvbiA+IHRoaXMuc2V0dGluZ3MuaW5pdExvbik/ICAtMSA6IDE7XG4gICAgICAgICAgICAgICAgaWYodGhpcy5zZXR0aW5ncy5iYWNrVG9WZXJ0aWNhbENlbnRlcil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPiAodGhpcy5zZXR0aW5ncy5pbml0TGF0IC0gTWF0aC5hYnModGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0KSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubGF0IDwgKHRoaXMuc2V0dGluZ3MuaW5pdExhdCArIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExhdCkpXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMuc2V0dGluZ3MuaW5pdExhdCA6IHRoaXMubGF0ICsgdGhpcy5zZXR0aW5ncy5yZXR1cm5TdGVwTGF0ICogc3ltYm9sTGF0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZih0aGlzLnNldHRpbmdzLmJhY2tUb0hvcml6b25DZW50ZXIpe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IChcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID4gKHRoaXMuc2V0dGluZ3MuaW5pdExvbiAtIE1hdGguYWJzKHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbikpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvbiA8ICh0aGlzLnNldHRpbmdzLmluaXRMb24gKyBNYXRoLmFicyh0aGlzLnNldHRpbmdzLnJldHVyblN0ZXBMb24pKVxuICAgICAgICAgICAgICAgICAgICApPyB0aGlzLnNldHRpbmdzLmluaXRMb24gOiB0aGlzLmxvbiArIHRoaXMuc2V0dGluZ3MucmV0dXJuU3RlcExvbiAqIHN5bWJvbExvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmxhdCA9IE1hdGgubWF4KCB0aGlzLnNldHRpbmdzLm1pbkxhdCwgTWF0aC5taW4oIHRoaXMuc2V0dGluZ3MubWF4TGF0LCB0aGlzLmxhdCApICk7XG4gICAgICAgICAgICB0aGlzLnBoaSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIDkwIC0gdGhpcy5sYXQgKTtcbiAgICAgICAgICAgIHRoaXMudGhldGEgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKCB0aGlzLmxvbiApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnggPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguY29zKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueSA9IDUwMCAqIE1hdGguY29zKCB0aGlzLnBoaSApO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudGFyZ2V0LnogPSA1MDAgKiBNYXRoLnNpbiggdGhpcy5waGkgKSAqIE1hdGguc2luKCB0aGlzLnRoZXRhICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5sb29rQXQoIHRoaXMuY2FtZXJhLnRhcmdldCApO1xuXG4gICAgICAgICAgICBpZighdGhpcy5zdXBwb3J0VmlkZW9UZXh0dXJlKXtcbiAgICAgICAgICAgICAgICB0aGlzLmhlbHBlckNhbnZhcy51cGRhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuY2xlYXIoKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKCB0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSApO1xuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgcGxheU9uTW9iaWxlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmlzUGxheU9uTW9iaWxlID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmKHRoaXMuc2V0dGluZ3MuYXV0b01vYmlsZU9yaWVudGF0aW9uKVxuICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdkZXZpY2Vtb3Rpb24nLCB0aGlzLmhhbmRsZU1vYmlsZU9yaWVudGF0aW9uLmJpbmQodGhpcykpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZWxfO1xuICAgICAgICB9XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBDYW52YXM7XG4iLCIvKipcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXG4gKiBAYXV0aG9yIG1yLmRvb2IgLyBodHRwOi8vbXJkb29iLmNvbS9cbiAqL1xuXG52YXIgRGV0ZWN0b3IgPSB7XG5cbiAgICBjYW52YXM6ICEhIHdpbmRvdy5DYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gICAgd2ViZ2w6ICggZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHRyeSB7XG5cbiAgICAgICAgICAgIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnY2FudmFzJyApOyByZXR1cm4gISEgKCB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0ICYmICggY2FudmFzLmdldENvbnRleHQoICd3ZWJnbCcgKSB8fCBjYW52YXMuZ2V0Q29udGV4dCggJ2V4cGVyaW1lbnRhbC13ZWJnbCcgKSApICk7XG5cbiAgICAgICAgfSBjYXRjaCAoIGUgKSB7XG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICB9XG5cbiAgICB9ICkoKSxcbiAgICB3b3JrZXJzOiAhISB3aW5kb3cuV29ya2VyLFxuICAgIGZpbGVhcGk6IHdpbmRvdy5GaWxlICYmIHdpbmRvdy5GaWxlUmVhZGVyICYmIHdpbmRvdy5GaWxlTGlzdCAmJiB3aW5kb3cuQmxvYixcblxuICAgICBDaGVja19WZXJzaW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgIHZhciBydiA9IC0xOyAvLyBSZXR1cm4gdmFsdWUgYXNzdW1lcyBmYWlsdXJlLlxuXG4gICAgICAgICBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gJ01pY3Jvc29mdCBJbnRlcm5ldCBFeHBsb3JlcicpIHtcblxuICAgICAgICAgICAgIHZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQsXG4gICAgICAgICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChcIk1TSUUgKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcblxuICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICBydiA9IHBhcnNlRmxvYXQoUmVnRXhwLiQxKTtcbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICAgICBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSBcIk5ldHNjYXBlXCIpIHtcbiAgICAgICAgICAgICAvLy8gaW4gSUUgMTEgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIHNheXMgJ3RyaWRlbnQnXG4gICAgICAgICAgICAgLy8vIGluIEVkZ2UgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIGRvZXMgbm90IHNheSB0cmlkZW50XG4gICAgICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1RyaWRlbnQnKSAhPT0gLTEpIHJ2ID0gMTE7XG4gICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudDtcbiAgICAgICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cChcIkVkZ2VcXC8oWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuICAgICAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgfVxuXG4gICAgICAgICByZXR1cm4gcnY7XG4gICAgIH0sXG5cbiAgICBzdXBwb3J0VmlkZW9UZXh0dXJlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vaWUgMTEgYW5kIGVkZ2UgMTIgZG9lc24ndCBzdXBwb3J0IHZpZGVvIHRleHR1cmUuXG4gICAgICAgIHZhciB2ZXJzaW9uID0gdGhpcy5DaGVja19WZXJzaW9uKCk7XG4gICAgICAgIHJldHVybiAodmVyc2lvbiA9PT0gLTEgfHwgdmVyc2lvbiA+PSAxMyk7XG4gICAgfSxcblxuICAgIGdldFdlYkdMRXJyb3JNZXNzYWdlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgICAgICBlbGVtZW50LmlkID0gJ3dlYmdsLWVycm9yLW1lc3NhZ2UnO1xuXG4gICAgICAgIGlmICggISB0aGlzLndlYmdsICkge1xuXG4gICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgPyBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgZ3JhcGhpY3MgY2FyZCBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIgLz4nLFxuICAgICAgICAgICAgICAgICdGaW5kIG91dCBob3cgdG8gZ2V0IGl0IDxhIGhyZWY9XCJodHRwOi8vZ2V0LndlYmdsLm9yZy9cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5oZXJlPC9hPi4nXG4gICAgICAgICAgICBdLmpvaW4oICdcXG4nICkgOiBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgYnJvd3NlciBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG5cbiAgICB9LFxuXG4gICAgYWRkR2V0V2ViR0xNZXNzYWdlOiBmdW5jdGlvbiAoIHBhcmFtZXRlcnMgKSB7XG5cbiAgICAgICAgdmFyIHBhcmVudCwgaWQsIGVsZW1lbnQ7XG5cbiAgICAgICAgcGFyYW1ldGVycyA9IHBhcmFtZXRlcnMgfHwge307XG5cbiAgICAgICAgcGFyZW50ID0gcGFyYW1ldGVycy5wYXJlbnQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMucGFyZW50IDogZG9jdW1lbnQuYm9keTtcbiAgICAgICAgaWQgPSBwYXJhbWV0ZXJzLmlkICE9PSB1bmRlZmluZWQgPyBwYXJhbWV0ZXJzLmlkIDogJ29sZGllJztcblxuICAgICAgICBlbGVtZW50ID0gRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKTtcbiAgICAgICAgZWxlbWVudC5pZCA9IGlkO1xuXG4gICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCggZWxlbWVudCApO1xuXG4gICAgfVxuXG59O1xuXG4vLyBicm93c2VyaWZ5IHN1cHBvcnRcbmlmICggdHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgKSB7XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IERldGVjdG9yO1xuXG59IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA1LzIzLzE2LlxuICovXG52YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1oZWxwZXItY2FudmFzXCI7XG5cbnZhciBIZWxwZXJDYW52YXMgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgdGhpcy52aWRlb0VsZW1lbnQgPSBvcHRpb25zLnZpZGVvO1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IG9wdGlvbnMud2lkdGg7XG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0O1xuXG4gICAgICAgICAgICBlbGVtZW50LndpZHRoID0gdGhpcy53aWR0aDtcbiAgICAgICAgICAgIGVsZW1lbnQuaGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICBlbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBlbGVtZW50O1xuXG5cbiAgICAgICAgICAgIHRoaXMuY29udGV4dCA9IGVsZW1lbnQuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5kcmF3SW1hZ2UodGhpcy52aWRlb0VsZW1lbnQsIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgZ2V0Q29udGV4dDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQ7ICBcbiAgICAgICAgfSxcbiAgICAgICAgXG4gICAgICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSGVscGVyQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNi82LzE2LlxuICovXG52YXIgTW9iaWxlQnVmZmVyaW5nID0ge1xuICAgIHByZXZfY3VycmVudFRpbWU6IDAsXG4gICAgY291bnRlcjogMCxcbiAgICBcbiAgICBpc0J1ZmZlcmluZzogZnVuY3Rpb24gKGN1cnJlbnRUaW1lKSB7XG4gICAgICAgIGlmIChjdXJyZW50VGltZSA9PSB0aGlzLnByZXZfY3VycmVudFRpbWUpIHRoaXMuY291bnRlcisrO1xuICAgICAgICBlbHNlIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucHJldl9jdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICBpZih0aGlzLmNvdW50ZXIgPiAxMCl7XG4gICAgICAgICAgICAvL25vdCBsZXQgY291bnRlciBvdmVyZmxvd1xuICAgICAgICAgICAgdGhpcy5jb3VudGVyID0gMTA7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBNb2JpbGVCdWZmZXJpbmc7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzQvMTYuXG4gKi9cblxudmFyIE5vdGljZSA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1ub3RpY2UtbGFiZWxcIjtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwib2JqZWN0XCIpe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgIH1lbHNlIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJzdHJpbmdcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTm90aWNlOyIsIi8qKlxuICogQ3JlYXRlZCBieSB3ZW5zaGVuZy55YW4gb24gNC80LzE2LlxuICovXG5mdW5jdGlvbiB3aGljaFRyYW5zaXRpb25FdmVudCgpe1xuICAgIHZhciB0O1xuICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zha2VlbGVtZW50Jyk7XG4gICAgdmFyIHRyYW5zaXRpb25zID0ge1xuICAgICAgICAndHJhbnNpdGlvbic6J3RyYW5zaXRpb25lbmQnLFxuICAgICAgICAnT1RyYW5zaXRpb24nOidvVHJhbnNpdGlvbkVuZCcsXG4gICAgICAgICdNb3pUcmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdXZWJraXRUcmFuc2l0aW9uJzond2Via2l0VHJhbnNpdGlvbkVuZCdcbiAgICB9O1xuXG4gICAgZm9yKHQgaW4gdHJhbnNpdGlvbnMpe1xuICAgICAgICBpZiggZWwuc3R5bGVbdF0gIT09IHVuZGVmaW5lZCApe1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zaXRpb25zW3RdO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtb2JpbGVBbmRUYWJsZXRjaGVjaygpIHtcbiAgICB2YXIgY2hlY2sgPSBmYWxzZTtcbiAgICAoZnVuY3Rpb24oYSl7aWYoLyhhbmRyb2lkfGJiXFxkK3xtZWVnbykuK21vYmlsZXxhdmFudGdvfGJhZGFcXC98YmxhY2tiZXJyeXxibGF6ZXJ8Y29tcGFsfGVsYWluZXxmZW5uZWN8aGlwdG9wfGllbW9iaWxlfGlwKGhvbmV8b2QpfGlyaXN8a2luZGxlfGxnZSB8bWFlbW98bWlkcHxtbXB8bW9iaWxlLitmaXJlZm94fG5ldGZyb250fG9wZXJhIG0ob2J8aW4paXxwYWxtKCBvcyk/fHBob25lfHAoaXhpfHJlKVxcL3xwbHVja2VyfHBvY2tldHxwc3B8c2VyaWVzKDR8NikwfHN5bWJpYW58dHJlb3x1cFxcLihicm93c2VyfGxpbmspfHZvZGFmb25lfHdhcHx3aW5kb3dzIGNlfHhkYXx4aWlub3xhbmRyb2lkfGlwYWR8cGxheWJvb2t8c2lsay9pLnRlc3QoYSl8fC8xMjA3fDYzMTB8NjU5MHwzZ3NvfDR0aHB8NTBbMS02XWl8Nzcwc3w4MDJzfGEgd2F8YWJhY3xhYyhlcnxvb3xzXFwtKXxhaShrb3xybil8YWwoYXZ8Y2F8Y28pfGFtb2l8YW4oZXh8bnl8eXcpfGFwdHV8YXIoY2h8Z28pfGFzKHRlfHVzKXxhdHR3fGF1KGRpfFxcLW18ciB8cyApfGF2YW58YmUoY2t8bGx8bnEpfGJpKGxifHJkKXxibChhY3xheil8YnIoZXx2KXd8YnVtYnxid1xcLShufHUpfGM1NVxcL3xjYXBpfGNjd2F8Y2RtXFwtfGNlbGx8Y2h0bXxjbGRjfGNtZFxcLXxjbyhtcHxuZCl8Y3Jhd3xkYShpdHxsbHxuZyl8ZGJ0ZXxkY1xcLXN8ZGV2aXxkaWNhfGRtb2J8ZG8oY3xwKW98ZHMoMTJ8XFwtZCl8ZWwoNDl8YWkpfGVtKGwyfHVsKXxlcihpY3xrMCl8ZXNsOHxleihbNC03XTB8b3N8d2F8emUpfGZldGN8Zmx5KFxcLXxfKXxnMSB1fGc1NjB8Z2VuZXxnZlxcLTV8Z1xcLW1vfGdvKFxcLnd8b2QpfGdyKGFkfHVuKXxoYWllfGhjaXR8aGRcXC0obXxwfHQpfGhlaVxcLXxoaShwdHx0YSl8aHAoIGl8aXApfGhzXFwtY3xodChjKFxcLXwgfF98YXxnfHB8c3x0KXx0cCl8aHUoYXd8dGMpfGlcXC0oMjB8Z298bWEpfGkyMzB8aWFjKCB8XFwtfFxcLyl8aWJyb3xpZGVhfGlnMDF8aWtvbXxpbTFrfGlubm98aXBhcXxpcmlzfGphKHR8dilhfGpicm98amVtdXxqaWdzfGtkZGl8a2VqaXxrZ3QoIHxcXC8pfGtsb258a3B0IHxrd2NcXC18a3lvKGN8ayl8bGUobm98eGkpfGxnKCBnfFxcLyhrfGx8dSl8NTB8NTR8XFwtW2Etd10pfGxpYnd8bHlueHxtMVxcLXd8bTNnYXxtNTBcXC98bWEodGV8dWl8eG8pfG1jKDAxfDIxfGNhKXxtXFwtY3J8bWUocmN8cmkpfG1pKG84fG9hfHRzKXxtbWVmfG1vKDAxfDAyfGJpfGRlfGRvfHQoXFwtfCB8b3x2KXx6eil8bXQoNTB8cDF8diApfG13YnB8bXl3YXxuMTBbMC0yXXxuMjBbMi0zXXxuMzAoMHwyKXxuNTAoMHwyfDUpfG43KDAoMHwxKXwxMCl8bmUoKGN8bSlcXC18b258dGZ8d2Z8d2d8d3QpfG5vayg2fGkpfG56cGh8bzJpbXxvcCh0aXx3dil8b3Jhbnxvd2cxfHA4MDB8cGFuKGF8ZHx0KXxwZHhnfHBnKDEzfFxcLShbMS04XXxjKSl8cGhpbHxwaXJlfHBsKGF5fHVjKXxwblxcLTJ8cG8oY2t8cnR8c2UpfHByb3h8cHNpb3xwdFxcLWd8cWFcXC1hfHFjKDA3fDEyfDIxfDMyfDYwfFxcLVsyLTddfGlcXC0pfHF0ZWt8cjM4MHxyNjAwfHJha3N8cmltOXxybyh2ZXx6byl8czU1XFwvfHNhKGdlfG1hfG1tfG1zfG55fHZhKXxzYygwMXxoXFwtfG9vfHBcXC0pfHNka1xcL3xzZShjKFxcLXwwfDEpfDQ3fG1jfG5kfHJpKXxzZ2hcXC18c2hhcnxzaWUoXFwtfG0pfHNrXFwtMHxzbCg0NXxpZCl8c20oYWx8YXJ8YjN8aXR8dDUpfHNvKGZ0fG55KXxzcCgwMXxoXFwtfHZcXC18diApfHN5KDAxfG1iKXx0MigxOHw1MCl8dDYoMDB8MTB8MTgpfHRhKGd0fGxrKXx0Y2xcXC18dGRnXFwtfHRlbChpfG0pfHRpbVxcLXx0XFwtbW98dG8ocGx8c2gpfHRzKDcwfG1cXC18bTN8bTUpfHR4XFwtOXx1cChcXC5ifGcxfHNpKXx1dHN0fHY0MDB8djc1MHx2ZXJpfHZpKHJnfHRlKXx2ayg0MHw1WzAtM118XFwtdil8dm00MHx2b2RhfHZ1bGN8dngoNTJ8NTN8NjB8NjF8NzB8ODB8ODF8ODN8ODV8OTgpfHczYyhcXC18ICl8d2ViY3x3aGl0fHdpKGcgfG5jfG53KXx3bWxifHdvbnV8eDcwMHx5YXNcXC18eW91cnx6ZXRvfHp0ZVxcLS9pLnRlc3QoYS5zdWJzdHIoMCw0KSkpY2hlY2sgPSB0cnVlfSkobmF2aWdhdG9yLnVzZXJBZ2VudHx8bmF2aWdhdG9yLnZlbmRvcnx8d2luZG93Lm9wZXJhKTtcbiAgICByZXR1cm4gY2hlY2s7XG59XG5cbmZ1bmN0aW9uIGlzSW9zKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQYWR8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG59XG5cbmZ1bmN0aW9uIGlzUmVhbElwaG9uZSgpIHtcbiAgICByZXR1cm4gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICB3aGljaFRyYW5zaXRpb25FdmVudDogd2hpY2hUcmFuc2l0aW9uRXZlbnQsXG4gICAgbW9iaWxlQW5kVGFibGV0Y2hlY2s6IG1vYmlsZUFuZFRhYmxldGNoZWNrLFxuICAgIGlzSW9zOiBpc0lvcyxcbiAgICBpc1JlYWxJcGhvbmU6IGlzUmVhbElwaG9uZVxufTsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgdXRpbCBmcm9tICcuL2xpYi9VdGlsJztcbmltcG9ydCBEZXRlY3RvciBmcm9tICcuL2xpYi9EZXRlY3Rvcic7XG5pbXBvcnQgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUgZnJvbSAnaXBob25lLWlubGluZS12aWRlbyc7XG5cbmNvbnN0IHJ1bk9uTW9iaWxlID0gKHV0aWwubW9iaWxlQW5kVGFibGV0Y2hlY2soKSk7XG5cbi8vIERlZmF1bHQgb3B0aW9ucyBmb3IgdGhlIHBsdWdpbi5cbmNvbnN0IGRlZmF1bHRzID0ge1xuICAgIGNsaWNrQW5kRHJhZzogcnVuT25Nb2JpbGUsXG4gICAgc2hvd05vdGljZTogdHJ1ZSxcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlBsZWFzZSB1c2UgeW91ciBtb3VzZSBkcmFnIGFuZCBkcm9wIHRoZSB2aWRlby5cIixcbiAgICBhdXRvSGlkZU5vdGljZTogMzAwMCxcbiAgICAvL2xpbWl0IHRoZSB2aWRlbyBzaXplIHdoZW4gdXNlciBzY3JvbGwuXG4gICAgc2Nyb2xsYWJsZTogdHJ1ZSxcbiAgICBpbml0Rm92OiA3NSxcbiAgICBtYXhGb3Y6IDEwNSxcbiAgICBtaW5Gb3Y6IDUxLFxuICAgIC8vaW5pdGlhbCBwb3NpdGlvbiBmb3IgdGhlIHZpZGVvXG4gICAgaW5pdExhdDogMCxcbiAgICBpbml0TG9uOiAtMTgwLFxuICAgIC8vQSBmbG9hdCB2YWx1ZSBiYWNrIHRvIGNlbnRlciB3aGVuIG1vdXNlIG91dCB0aGUgY2FudmFzLiBUaGUgaGlnaGVyLCB0aGUgZmFzdGVyLlxuICAgIHJldHVyblN0ZXBMYXQ6IDAuNSxcbiAgICByZXR1cm5TdGVwTG9uOiAyLFxuICAgIGJhY2tUb1ZlcnRpY2FsQ2VudGVyOiAhcnVuT25Nb2JpbGUsXG4gICAgYmFja1RvSG9yaXpvbkNlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGNsaWNrVG9Ub2dnbGU6IGZhbHNlLFxuICAgIFxuICAgIC8vbGltaXQgdmlld2FibGUgem9vbVxuICAgIG1pbkxhdDogLTg1LFxuICAgIG1heExhdDogODUsXG4gICAgdmlkZW9UeXBlOiBcImVxdWlyZWN0YW5ndWxhclwiLFxuICAgIFxuICAgIHJvdGF0ZVg6IDAsXG4gICAgcm90YXRlWTogMCxcbiAgICByb3RhdGVaOiAwLFxuICAgIFxuICAgIGF1dG9Nb2JpbGVPcmllbnRhdGlvbjogZmFsc2UsXG4gICAgbW9iaWxlVmlicmF0aW9uVmFsdWU6IHV0aWwuaXNJb3MoKT8gMC4wMjIgOiAxXG59O1xuXG5mdW5jdGlvbiBwbGF5ZXJSZXNpemUocGxheWVyKXtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS53aWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoICsgXCJweFwiO1xuICAgICAgICBwbGF5ZXIuZWwoKS5zdHlsZS5oZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBmdWxsc2NyZWVuT25JT1MocGxheWVyLCBjbGlja0ZuKSB7XG4gICAgdmFyIHJlc2l6ZUZuID0gcGxheWVyUmVzaXplKHBsYXllcik7XG4gICAgcGxheWVyLmNvbnRyb2xCYXIuZnVsbHNjcmVlblRvZ2dsZS5vZmYoXCJ0YXBcIiwgY2xpY2tGbik7XG4gICAgcGxheWVyLmNvbnRyb2xCYXIuZnVsbHNjcmVlblRvZ2dsZS5vbihcInRhcFwiLCBmdW5jdGlvbiBmdWxsc2NyZWVuKCkge1xuICAgICAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICAgICAgaWYoIXBsYXllci5pc0Z1bGxzY3JlZW4oKSl7XG4gICAgICAgICAgICAvL3NldCB0byBmdWxsc2NyZWVuXG4gICAgICAgICAgICBwbGF5ZXIuaXNGdWxsc2NyZWVuKHRydWUpO1xuICAgICAgICAgICAgcGxheWVyLmVudGVyRnVsbFdpbmRvdygpO1xuICAgICAgICAgICAgcmVzaXplRm4oKTtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZGV2aWNlbW90aW9uXCIsIHJlc2l6ZUZuKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBwbGF5ZXIuaXNGdWxsc2NyZWVuKGZhbHNlKTtcbiAgICAgICAgICAgIHBsYXllci5leGl0RnVsbFdpbmRvdygpO1xuICAgICAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUud2lkdGggPSBcIlwiO1xuICAgICAgICAgICAgcGxheWVyLmVsKCkuc3R5bGUuaGVpZ2h0ID0gXCJcIjtcbiAgICAgICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwiZGV2aWNlbW90aW9uXCIsIHJlc2l6ZUZuKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG4vKipcbiAqIEZ1bmN0aW9uIHRvIGludm9rZSB3aGVuIHRoZSBwbGF5ZXIgaXMgcmVhZHkuXG4gKlxuICogVGhpcyBpcyBhIGdyZWF0IHBsYWNlIGZvciB5b3VyIHBsdWdpbiB0byBpbml0aWFsaXplIGl0c2VsZi4gV2hlbiB0aGlzXG4gKiBmdW5jdGlvbiBpcyBjYWxsZWQsIHRoZSBwbGF5ZXIgd2lsbCBoYXZlIGl0cyBET00gYW5kIGNoaWxkIGNvbXBvbmVudHNcbiAqIGluIHBsYWNlLlxuICpcbiAqIEBmdW5jdGlvbiBvblBsYXllclJlYWR5XG4gKiBAcGFyYW0gICAge1BsYXllcn0gcGxheWVyXG4gKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gKi9cbmNvbnN0IG9uUGxheWVyUmVhZHkgPSAocGxheWVyLCBvcHRpb25zLCBzZXR0aW5ncykgPT4ge1xuICAgIHBsYXllci5hZGRDbGFzcygndmpzLXBhbm9yYW1hJyk7XG4gICAgaWYoIURldGVjdG9yLndlYmdsKXtcbiAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCB7XG4gICAgICAgICAgICBOb3RpY2VNZXNzYWdlOiBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpLFxuICAgICAgICAgICAgYXV0b0hpZGVOb3RpY2U6IG9wdGlvbnMuYXV0b0hpZGVOb3RpY2VcbiAgICAgICAgfSk7XG4gICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spe1xuICAgICAgICAgICAgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcGxheWVyLmFkZENoaWxkKCdDYW52YXMnLCBvcHRpb25zKTtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICBpZihydW5Pbk1vYmlsZSl7XG4gICAgICAgIHZhciB2aWRlb0VsZW1lbnQgPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgIGlmKHV0aWwuaXNSZWFsSXBob25lKCkpe1xuICAgICAgICAgICAgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUodmlkZW9FbGVtZW50LCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBpZih1dGlsLmlzSW9zKCkpe1xuICAgICAgICAgICAgZnVsbHNjcmVlbk9uSU9TKHBsYXllciwgc2V0dGluZ3MuZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm4ocGxheWVyKSk7XG4gICAgICAgIH1cbiAgICAgICAgcGxheWVyLmFkZENsYXNzKFwidmpzLXBhbm9yYW1hLW1vYmlsZS1pbmxpbmUtdmlkZW9cIik7XG4gICAgICAgIHBsYXllci5yZW1vdmVDbGFzcyhcInZqcy11c2luZy1uYXRpdmUtY29udHJvbHNcIik7XG4gICAgICAgIGNhbnZhcy5wbGF5T25Nb2JpbGUoKTtcbiAgICB9XG4gICAgaWYob3B0aW9ucy5zaG93Tm90aWNlKXtcbiAgICAgICAgcGxheWVyLm9uKFwicGxheWluZ1wiLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCBvcHRpb25zKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGNhbnZhcy5oaWRlKCk7XG4gICAgcGxheWVyLm9uKFwicGxheVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5zaG93KCk7XG4gICAgfSk7XG4gICAgcGxheWVyLm9uKFwiZnVsbHNjcmVlbmNoYW5nZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNhbnZhcy5oYW5kbGVSZXNpemUoKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IFBvcHVwTm90aWZpY2F0aW9uID0gKHBsYXllciwgb3B0aW9ucyA9IHtcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlwiXG59KSA9PiB7XG4gICAgdmFyIG5vdGljZSA9IHBsYXllci5hZGRDaGlsZCgnTm90aWNlJywgb3B0aW9ucyk7XG5cbiAgICBpZihvcHRpb25zLmF1dG9IaWRlTm90aWNlID4gMCl7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbm90aWNlLmFkZENsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgdmFyIHRyYW5zaXRpb25FdmVudCA9IHV0aWwud2hpY2hUcmFuc2l0aW9uRXZlbnQoKTtcbiAgICAgICAgICAgIHZhciBoaWRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgbm90aWNlLnJlbW92ZUNsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5vZmYodHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBub3RpY2Uub24odHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgfSwgb3B0aW9ucy5hdXRvSGlkZU5vdGljZSk7XG4gICAgfVxufTtcblxuY29uc3QgcGx1Z2luID0gZnVuY3Rpb24oc2V0dGluZ3MgPSB7fSl7XG4gICAgLyoqXG4gICAgICogQSB2aWRlby5qcyBwbHVnaW4uXG4gICAgICpcbiAgICAgKiBJbiB0aGUgcGx1Z2luIGZ1bmN0aW9uLCB0aGUgdmFsdWUgb2YgYHRoaXNgIGlzIGEgdmlkZW8uanMgYFBsYXllcmBcbiAgICAgKiBpbnN0YW5jZS4gWW91IGNhbm5vdCByZWx5IG9uIHRoZSBwbGF5ZXIgYmVpbmcgaW4gYSBcInJlYWR5XCIgc3RhdGUgaGVyZSxcbiAgICAgKiBkZXBlbmRpbmcgb24gaG93IHRoZSBwbHVnaW4gaXMgaW52b2tlZC4gVGhpcyBtYXkgb3IgbWF5IG5vdCBiZSBpbXBvcnRhbnRcbiAgICAgKiB0byB5b3U7IGlmIG5vdCwgcmVtb3ZlIHRoZSB3YWl0IGZvciBcInJlYWR5XCIhXG4gICAgICpcbiAgICAgKiBAZnVuY3Rpb24gcGFub3JhbWFcbiAgICAgKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gICAgICogICAgICAgICAgIEFuIG9iamVjdCBvZiBvcHRpb25zIGxlZnQgdG8gdGhlIHBsdWdpbiBhdXRob3IgdG8gZGVmaW5lLlxuICAgICAqL1xuICAgIGNvbnN0IHZpZGVvVHlwZXMgPSBbXCJlcXVpcmVjdGFuZ3VsYXJcIiwgXCJmaXNoZXllXCJdO1xuICAgIGNvbnN0IHBhbm9yYW1hID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICBpZihzZXR0aW5ncy5tZXJnZU9wdGlvbikgb3B0aW9ucyA9IHNldHRpbmdzLm1lcmdlT3B0aW9uKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICAgICAgaWYodmlkZW9UeXBlcy5pbmRleE9mKG9wdGlvbnMudmlkZW9UeXBlKSA9PSAtMSkgZGVmYXVsdHMudmlkZW9UeXBlO1xuICAgICAgICB0aGlzLnJlYWR5KCgpID0+IHtcbiAgICAgICAgICAgIG9uUGxheWVyUmVhZHkodGhpcywgb3B0aW9ucywgc2V0dGluZ3MpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4vLyBJbmNsdWRlIHRoZSB2ZXJzaW9uIG51bWJlci5cbiAgICBwYW5vcmFtYS5WRVJTSU9OID0gJzAuMC43JztcblxuICAgIHJldHVybiBwYW5vcmFtYTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgcGx1Z2luO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgQ2FudmFzICBmcm9tICcuL2xpYi9DYW52YXMnO1xuaW1wb3J0IE5vdGljZSAgZnJvbSAnLi9saWIvTm90aWNlJztcbmltcG9ydCBIZWxwZXJDYW52YXMgZnJvbSAnLi9saWIvSGVscGVyQ2FudmFzJztcbmltcG9ydCBwYW5vcmFtYSBmcm9tICcuL3BsdWdpbic7XG5cbmZ1bmN0aW9uIGdldFRlY2gocGxheWVyKSB7XG4gICAgcmV0dXJuIHBsYXllci50ZWNoKHsgSVdpbGxOb3RVc2VUaGlzSW5QbHVnaW5zOiB0cnVlIH0pLmVsKCk7XG59XG5cbmZ1bmN0aW9uIGdldEZ1bGxzY3JlZW5Ub2dnbGVDbGlja0ZuKHBsYXllcikge1xuICAgIHJldHVybiBwbGF5ZXIuY29udHJvbEJhci5mdWxsc2NyZWVuVG9nZ2xlLmhhbmRsZUNsaWNrXG59XG5cbnZhciBjb21wb25lbnQgPSB2aWRlb2pzLmdldENvbXBvbmVudCgnQ29tcG9uZW50Jyk7XG52YXIgY2FudmFzID0gQ2FudmFzKGNvbXBvbmVudCwge1xuICAgIGdldFRlY2g6IGdldFRlY2hcbn0pO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBjYW52YXMpKTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnTm90aWNlJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBub3RpY2UpKTtcblxudmFyIGhlbHBlckNhbnZhcyA9IEhlbHBlckNhbnZhcyhjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnSGVscGVyQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBoZWxwZXJDYW52YXMpKTtcblxuLy8gUmVnaXN0ZXIgdGhlIHBsdWdpbiB3aXRoIHZpZGVvLmpzLlxuXG52aWRlb2pzLnBsdWdpbigncGFub3JhbWEnLCBwYW5vcmFtYSh7XG4gICAgbWVyZ2VPcHRpb246IGZ1bmN0aW9uIChkZWZhdWx0cywgb3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdmlkZW9qcy5tZXJnZU9wdGlvbnMoZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgIH0sXG4gICAgZ2V0VGVjaDogZ2V0VGVjaCxcbiAgICBnZXRGdWxsc2NyZWVuVG9nZ2xlQ2xpY2tGbjogZ2V0RnVsbHNjcmVlblRvZ2dsZUNsaWNrRm5cbn0pKTtcbiJdfQ==
