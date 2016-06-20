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
            baseComponent.call(this, player, options);

            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.videoType = options.videoType;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;
            this.player = player;
            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 1, 2000);
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
            if (options.vrEnable) {
                this.vrControls = new THREE.OculusRiftControls(this.camera);
                this.scene.add(vrControls.getObject());
                this.vrEffect = new THREE.OculusRiftEffect(this.renderer);
                this.vrstate = new vr.State();
                this.vrtime = new Date().getTime();
            }
            this.el_ = this.renderer.domElement;
            this.el_.classList.add('vjs-video-canvas');

            this.attachControlEvents();
            this.player.on("play", function () {
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
            if (this.options_.scrollable) {
                this.on('mousewheel', this.handleMouseWheel.bind(this));
                this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
            }
            this.on('mouseenter', this.handleMouseEnter.bind(this));
            this.on('mouseleave', this.handleMouseLease.bind(this));
        },

        handleResize: function handleResize() {
            this.width = this.player.el().offsetWidth, this.height = this.player.el().offsetHeight;
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
                if (diffX < 0.1 && diffY < 0.1) this.player.paused() ? this.player.play() : this.player.pause();
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
            if (this.options_.clickAndDrag) {
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
                this.lon = this.lon - y * this.options_.mobileVibrationValue;
                this.lat = this.lat + x * this.options_.mobileVibrationValue;
            } else if (window.matchMedia("(orientation: landscape)").matches) {
                var orientationDegree = -90;
                if (typeof window.orientation != "undefined") {
                    orientationDegree = window.orientation;
                }

                this.lon = orientationDegree == -90 ? this.lon + x * this.options_.mobileVibrationValue : this.lon - x * this.options_.mobileVibrationValue;
                this.lat = orientationDegree == -90 ? this.lat + y * this.options_.mobileVibrationValue : this.lat - y * this.options_.mobileVibrationValue;
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
            this.camera.fov = Math.min(this.options_.maxFov, this.camera.fov);
            this.camera.fov = Math.max(this.options_.minFov, this.camera.fov);
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
            if (!this.player.paused()) {
                if (typeof this.texture !== "undefined" && (!this.isPlayOnMobile && this.player.readyState() === HAVE_ENOUGH_DATA || this.isPlayOnMobile && this.player.hasClass("vjs-playing"))) {
                    var ct = new Date().getTime();
                    if (ct - this.time >= 30) {
                        this.texture.needsUpdate = true;
                        this.time = ct;
                    }
                    if (this.isPlayOnMobile) {
                        var currentTime = this.player.currentTime();
                        if (_MobileBuffering2.default.isBuffering(currentTime)) {
                            if (!this.player.hasClass("vjs-panorama-moible-inline-video-buffering")) {
                                this.player.addClass("vjs-panorama-moible-inline-video-buffering");
                            }
                        } else {
                            if (this.player.hasClass("vjs-panorama-moible-inline-video-buffering")) {
                                this.player.removeClass("vjs-panorama-moible-inline-video-buffering");
                            }
                        }
                    }
                }
            }

            if (this.options_.vrEnable) {
                var polled = vr.pollState(this.vrstate);
                var ct = new Date().getTime();
                this.vrControls.update(ct - this.vrtime, polled ? this.vrstate : null);
                this.vrtime = ct;
                this.vrEffect.render(this.scene, this.camera, polled ? this.vrstate : null);
            } else {
                this.render();
            }
        },

        render: function render() {
            if (!this.isUserInteracting) {
                var symbolLat = this.lat > this.options_.initLat ? -1 : 1;
                var symbolLon = this.lon > this.options_.initLon ? -1 : 1;
                if (this.options_.backToVerticalCenter) {
                    this.lat = this.lat > this.options_.initLat - Math.abs(this.options_.returnStepLat) && this.lat < this.options_.initLat + Math.abs(this.options_.returnStepLat) ? this.options_.initLat : this.lat + this.options_.returnStepLat * symbolLat;
                }
                if (this.options_.backToHorizonCenter) {
                    this.lon = this.lon > this.options_.initLon - Math.abs(this.options_.returnStepLon) && this.lon < this.options_.initLon + Math.abs(this.options_.returnStepLon) ? this.options_.initLon : this.lon + this.options_.returnStepLon * symbolLon;
                }
            }
            this.lat = Math.max(this.options_.minLat, Math.min(this.options_.maxLat, this.lat));
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
            if (this.options_.autoMobileOrientation) window.addEventListener('devicemotion', this.handleMobileOrientation.bind(this));
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
    mobileVibrationValue: _Util2.default.isIos() ? 0.022 : 1,

    vrEnable: false
};

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
        player.addClass("vjs-panorama-moible-inline-video");
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
        //check vr support
        if (typeof vr !== "undefined") {
            options.vrEnable = true;
            if (!vr.isInstalled()) {
                options.vrEnable = false;
                console.error('NPVR plugin not installed!');
            }
            vr.load(function (error) {
                if (error) {
                    options.vrEnable = false;
                    console.error('Plugin load failed: ' + error.toString());
                }
            });
        }
        this.ready(function () {
            onPlayerReady(_this, options, settings);
        });
    };

    // Include the version number.
    panorama.VERSION = '0.0.6';

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
    getTech: getTech
}));

},{"./lib/Canvas":2,"./lib/HelperCanvas":4,"./lib/Notice":6,"./plugin":8}]},{},[9])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaXBob25lLWlubGluZS12aWRlby9kaXN0L2lwaG9uZS1pbmxpbmUtdmlkZW8uY29tbW9uLWpzLmpzIiwic3JjL3NjcmlwdHMvbGliL0NhbnZhcy5qcyIsInNyYy9zY3JpcHRzL2xpYi9EZXRlY3Rvci5qcyIsInNyYy9zY3JpcHRzL2xpYi9IZWxwZXJDYW52YXMuanMiLCJzcmMvc2NyaXB0cy9saWIvTW9iaWxlQnVmZmVyaW5nLmpzIiwic3JjL3NjcmlwdHMvbGliL05vdGljZS5qcyIsInNyYy9zY3JpcHRzL2xpYi9VdGlsLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luLmpzIiwic3JjL3NjcmlwdHMvcGx1Z2luX3Y1LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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NkI7QUFDdEMsZUFBTyxRQUFRLFlBQVIsQ0FBcUIsUUFBckIsRUFBK0IsT0FBL0IsQ0FBUCxDQURzQztLQUE3QjtBQUdiLGFBQVMsT0FBVDtDQUp1QixDQUEzQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIEludGVydmFsb21ldGVyKGNiKSB7XG5cdHZhciByYWZJZCA9IHZvaWQgMDtcblx0dmFyIHByZXZpb3VzTG9vcFRpbWUgPSB2b2lkIDA7XG5cdGZ1bmN0aW9uIGxvb3Aobm93KSB7XG5cdFx0Ly8gbXVzdCBiZSByZXF1ZXN0ZWQgYmVmb3JlIGNiKCkgYmVjYXVzZSB0aGF0IG1pZ2h0IGNhbGwgLnN0b3AoKVxuXHRcdHJhZklkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xuXHRcdGNiKG5vdyAtIChwcmV2aW91c0xvb3BUaW1lIHx8IG5vdykpOyAvLyBtcyBzaW5jZSBsYXN0IGNhbGwuIDAgb24gc3RhcnQoKVxuXHRcdHByZXZpb3VzTG9vcFRpbWUgPSBub3c7XG5cdH1cblx0dGhpcy5zdGFydCA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXJhZklkKSB7XG5cdFx0XHQvLyBwcmV2ZW50IGRvdWJsZSBzdGFydHNcblx0XHRcdGxvb3AoMCk7XG5cdFx0fVxuXHR9O1xuXHR0aGlzLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG5cdFx0Y2FuY2VsQW5pbWF0aW9uRnJhbWUocmFmSWQpO1xuXHRcdHJhZklkID0gbnVsbDtcblx0XHRwcmV2aW91c0xvb3BUaW1lID0gMDtcblx0fTtcbn1cblxuZnVuY3Rpb24gcHJldmVudEV2ZW50KGVsZW1lbnQsIGV2ZW50TmFtZSwgdG9nZ2xlUHJvcGVydHksIHByZXZlbnRXaXRoUHJvcGVydHkpIHtcblx0ZnVuY3Rpb24gaGFuZGxlcihlKSB7XG5cdFx0aWYgKEJvb2xlYW4oZWxlbWVudFt0b2dnbGVQcm9wZXJ0eV0pID09PSBCb29sZWFuKHByZXZlbnRXaXRoUHJvcGVydHkpKSB7XG5cdFx0XHRlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0Ly8gY29uc29sZS5sb2coZXZlbnROYW1lLCAncHJldmVudGVkIG9uJywgZWxlbWVudCk7XG5cdFx0fVxuXHRcdGRlbGV0ZSBlbGVtZW50W3RvZ2dsZVByb3BlcnR5XTtcblx0fVxuXHRlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCBoYW5kbGVyLCBmYWxzZSk7XG5cblx0Ly8gUmV0dXJuIGhhbmRsZXIgdG8gYWxsb3cgdG8gZGlzYWJsZSB0aGUgcHJldmVudGlvbi4gVXNhZ2U6XG5cdC8vIGNvbnN0IHByZXZlbnRpb25IYW5kbGVyID0gcHJldmVudEV2ZW50KGVsLCAnY2xpY2snKTtcblx0Ly8gZWwucmVtb3ZlRXZlbnRIYW5kbGVyKCdjbGljaycsIHByZXZlbnRpb25IYW5kbGVyKTtcblx0cmV0dXJuIGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHByb3h5UHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIHNvdXJjZU9iamVjdCwgY29weUZpcnN0KSB7XG5cdGZ1bmN0aW9uIGdldCgpIHtcblx0XHRyZXR1cm4gc291cmNlT2JqZWN0W3Byb3BlcnR5TmFtZV07XG5cdH1cblx0ZnVuY3Rpb24gc2V0KHZhbHVlKSB7XG5cdFx0c291cmNlT2JqZWN0W3Byb3BlcnR5TmFtZV0gPSB2YWx1ZTtcblx0fVxuXG5cdGlmIChjb3B5Rmlyc3QpIHtcblx0XHRzZXQob2JqZWN0W3Byb3BlcnR5TmFtZV0pO1xuXHR9XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iamVjdCwgcHJvcGVydHlOYW1lLCB7IGdldDogZ2V0LCBzZXQ6IHNldCB9KTtcbn1cblxuLypcbkZpbGUgaW1wb3J0ZWQgZnJvbTogaHR0cHM6Ly9naXRodWIuY29tL2JmcmVkLWl0L3Bvb3ItbWFucy1zeW1ib2xcblVudGlsIEkgY29uZmlndXJlIHJvbGx1cCB0byBpbXBvcnQgZXh0ZXJuYWwgbGlicyBpbnRvIHRoZSBJSUZFIGJ1bmRsZVxuKi9cblxudmFyIF9TeW1ib2wgPSB0eXBlb2YgU3ltYm9sID09PSAndW5kZWZpbmVkJyA/IGZ1bmN0aW9uIChkZXNjcmlwdGlvbikge1xuXHRyZXR1cm4gJ0AnICsgKGRlc2NyaXB0aW9uIHx8ICdAJykgKyBNYXRoLnJhbmRvbSgpO1xufSA6IFN5bWJvbDtcblxudmFyIGlzTmVlZGVkID0gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcblxudmFyIOCyoCA9IF9TeW1ib2woKTtcbnZhciDgsqBldmVudCA9IF9TeW1ib2woKTtcbnZhciDgsqBwbGF5ID0gX1N5bWJvbCgnbmF0aXZlcGxheScpO1xudmFyIOCyoHBhdXNlID0gX1N5bWJvbCgnbmF0aXZlcGF1c2UnKTtcblxuLyoqXG4gKiBVVElMU1xuICovXG5cbmZ1bmN0aW9uIGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKSB7XG5cdHZhciBhdWRpbyA9IG5ldyBBdWRpbygpO1xuXHRhdWRpby5zcmMgPSB2aWRlby5jdXJyZW50U3JjIHx8IHZpZGVvLnNyYztcblx0YXVkaW8uY3Jvc3NPcmlnaW4gPSB2aWRlby5jcm9zc09yaWdpbjtcblx0cmV0dXJuIGF1ZGlvO1xufVxuXG52YXIgbGFzdFJlcXVlc3RzID0gW107XG5sYXN0UmVxdWVzdHMuaSA9IDA7XG5cbmZ1bmN0aW9uIHNldFRpbWUodmlkZW8sIHRpbWUpIHtcblx0Ly8gYWxsb3cgb25lIHRpbWV1cGRhdGUgZXZlbnQgZXZlcnkgMjAwKyBtc1xuXHRpZiAoKGxhc3RSZXF1ZXN0cy50dWUgfHwgMCkgKyAyMDAgPCBEYXRlLm5vdygpKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHRsYXN0UmVxdWVzdHMudHVlID0gRGF0ZS5ub3coKTtcblx0fVxuXHR2aWRlby5jdXJyZW50VGltZSA9IHRpbWU7XG5cdGxhc3RSZXF1ZXN0c1srK2xhc3RSZXF1ZXN0cy5pICUgM10gPSB0aW1lICogMTAwIHwgMCAvIDEwMDtcbn1cblxuZnVuY3Rpb24gaXNQbGF5ZXJFbmRlZChwbGF5ZXIpIHtcblx0cmV0dXJuIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPj0gcGxheWVyLnZpZGVvLmR1cmF0aW9uO1xufVxuXG5mdW5jdGlvbiB1cGRhdGUodGltZURpZmYpIHtcblx0Ly8gY29uc29sZS5sb2coJ3VwZGF0ZScpO1xuXHR2YXIgcGxheWVyID0gdGhpcztcblx0aWYgKHBsYXllci52aWRlby5yZWFkeVN0YXRlID49IHBsYXllci52aWRlby5IQVZFX0ZVVFVSRV9EQVRBKSB7XG5cdFx0aWYgKCFwbGF5ZXIuaGFzQXVkaW8pIHtcblx0XHRcdHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUgPSBwbGF5ZXIudmlkZW8uY3VycmVudFRpbWUgKyB0aW1lRGlmZiAqIHBsYXllci52aWRlby5wbGF5YmFja1JhdGUgLyAxMDAwO1xuXHRcdFx0aWYgKHBsYXllci52aWRlby5sb29wICYmIGlzUGxheWVyRW5kZWQocGxheWVyKSkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0c2V0VGltZShwbGF5ZXIudmlkZW8sIHBsYXllci5kcml2ZXIuY3VycmVudFRpbWUpO1xuXHR9XG5cblx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLnZpZGVvLmN1cnJlbnRUaW1lID09PSBwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lLCAnVmlkZW8gbm90IHVwZGF0aW5nIScpO1xuXG5cdGlmIChwbGF5ZXIudmlkZW8uZW5kZWQpIHtcblx0XHRwbGF5ZXIudmlkZW8ucGF1c2UodHJ1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBNRVRIT0RTXG4gKi9cblxuZnVuY3Rpb24gcGxheSgpIHtcblx0Ly8gY29uc29sZS5sb2coJ3BsYXknKVxuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHRoZSBkZXZlbG9wZXIgdGhlIG5hdGl2ZSBwbGF5ZXJcblx0aWYgKHZpZGVvLndlYmtpdERpc3BsYXlpbmdGdWxsc2NyZWVuKSB7XG5cdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRwbGF5ZXIucGF1c2VkID0gZmFsc2U7XG5cblx0aWYgKCF2aWRlby5idWZmZXJlZC5sZW5ndGgpIHtcblx0XHR2aWRlby5sb2FkKCk7XG5cdH1cblxuXHRwbGF5ZXIuZHJpdmVyLnBsYXkoKTtcblx0cGxheWVyLnVwZGF0ZXIuc3RhcnQoKTtcblxuXHR2aWRlby5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgncGxheScpKTtcblxuXHQvLyBUT0RPOiBzaG91bGQgYmUgZmlyZWQgbGF0ZXJcblx0dmlkZW8uZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3BsYXlpbmcnKSk7XG59XG5mdW5jdGlvbiBwYXVzZShmb3JjZUV2ZW50cykge1xuXHQvLyBjb25zb2xlLmxvZygncGF1c2UnKVxuXHR2YXIgdmlkZW8gPSB0aGlzO1xuXHR2YXIgcGxheWVyID0gdmlkZW9b4LKgXTtcblxuXHRwbGF5ZXIuZHJpdmVyLnBhdXNlKCk7XG5cdHBsYXllci51cGRhdGVyLnN0b3AoKTtcblxuXHQvLyBpZiBpdCdzIGZ1bGxzY3JlZW4sIHRoZSBkZXZlbG9wZXIgdGhlIG5hdGl2ZSBwbGF5ZXIucGF1c2UoKVxuXHQvLyBUaGlzIGlzIGF0IHRoZSBlbmQgb2YgcGF1c2UoKSBiZWNhdXNlIGl0IGFsc29cblx0Ly8gbmVlZHMgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHNpbXVsYXRpb24gaXMgcGF1c2VkXG5cdGlmICh2aWRlby53ZWJraXREaXNwbGF5aW5nRnVsbHNjcmVlbikge1xuXHRcdHZpZGVvW+CyoHBhdXNlXSgpO1xuXHR9XG5cblx0aWYgKHBsYXllci5wYXVzZWQgJiYgIWZvcmNlRXZlbnRzKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cGxheWVyLnBhdXNlZCA9IHRydWU7XG5cdHZpZGVvLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdwYXVzZScpKTtcblx0aWYgKHZpZGVvLmVuZGVkKSB7XG5cdFx0dmlkZW9b4LKgZXZlbnRdID0gdHJ1ZTtcblx0XHR2aWRlby5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnZW5kZWQnKSk7XG5cdH1cbn1cblxuLyoqXG4gKiBTRVRVUFxuICovXG5cbmZ1bmN0aW9uIGFkZFBsYXllcih2aWRlbywgaGFzQXVkaW8pIHtcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF0gPSB7fTtcblx0cGxheWVyLnBhdXNlZCA9IHRydWU7IC8vIHRyYWNrIHdoZXRoZXIgJ3BhdXNlJyBldmVudHMgaGF2ZSBiZWVuIGZpcmVkXG5cdHBsYXllci5oYXNBdWRpbyA9IGhhc0F1ZGlvO1xuXHRwbGF5ZXIudmlkZW8gPSB2aWRlbztcblx0cGxheWVyLnVwZGF0ZXIgPSBuZXcgSW50ZXJ2YWxvbWV0ZXIodXBkYXRlLmJpbmQocGxheWVyKSk7XG5cblx0aWYgKGhhc0F1ZGlvKSB7XG5cdFx0cGxheWVyLmRyaXZlciA9IGdldEF1ZGlvRnJvbVZpZGVvKHZpZGVvKTtcblx0fSBlbHNlIHtcblx0XHRwbGF5ZXIuZHJpdmVyID0ge1xuXHRcdFx0bXV0ZWQ6IHRydWUsXG5cdFx0XHRwYXVzZWQ6IHRydWUsXG5cdFx0XHRwYXVzZTogZnVuY3Rpb24gcGF1c2UoKSB7XG5cdFx0XHRcdHBsYXllci5kcml2ZXIucGF1c2VkID0gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRwbGF5OiBmdW5jdGlvbiBwbGF5KCkge1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLnBhdXNlZCA9IGZhbHNlO1xuXHRcdFx0XHQvLyBtZWRpYSBhdXRvbWF0aWNhbGx5IGdvZXMgdG8gMCBpZiAucGxheSgpIGlzIGNhbGxlZCB3aGVuIGl0J3MgZG9uZVxuXHRcdFx0XHRpZiAoaXNQbGF5ZXJFbmRlZChwbGF5ZXIpKSB7XG5cdFx0XHRcdFx0c2V0VGltZSh2aWRlbywgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXQgZW5kZWQoKSB7XG5cdFx0XHRcdHJldHVybiBpc1BsYXllckVuZGVkKHBsYXllcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vIC5sb2FkKCkgY2F1c2VzIHRoZSBlbXB0aWVkIGV2ZW50XG5cdC8vIHRoZSBhbHRlcm5hdGl2ZSBpcyAucGxheSgpKy5wYXVzZSgpIGJ1dCB0aGF0IHRyaWdnZXJzIHBsYXkvcGF1c2UgZXZlbnRzLCBldmVuIHdvcnNlXG5cdC8vIHBvc3NpYmx5IHRoZSBhbHRlcm5hdGl2ZSBpcyBwcmV2ZW50aW5nIHRoaXMgZXZlbnQgb25seSBvbmNlXG5cdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2VtcHRpZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKHBsYXllci5kcml2ZXIuc3JjICYmIHBsYXllci5kcml2ZXIuc3JjICE9PSB2aWRlby5jdXJyZW50U3JjKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnc3JjIGNoYW5nZWQnLCB2aWRlby5jdXJyZW50U3JjKTtcblx0XHRcdHNldFRpbWUodmlkZW8sIDApO1xuXHRcdFx0dmlkZW8ucGF1c2UoKTtcblx0XHRcdHBsYXllci5kcml2ZXIuc3JjID0gdmlkZW8uY3VycmVudFNyYztcblx0XHR9XG5cdH0sIGZhbHNlKTtcblxuXHQvLyBzdG9wIHByb2dyYW1tYXRpYyBwbGF5ZXIgd2hlbiBPUyB0YWtlcyBvdmVyXG5cdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGJlZ2luZnVsbHNjcmVlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXZpZGVvLnBhdXNlZCkge1xuXHRcdFx0Ly8gbWFrZSBzdXJlIHRoYXQgdGhlIDxhdWRpbz4gYW5kIHRoZSBzeW5jZXIvdXBkYXRlciBhcmUgc3RvcHBlZFxuXHRcdFx0dmlkZW8ucGF1c2UoKTtcblxuXHRcdFx0Ly8gcGxheSB2aWRlbyBuYXRpdmVseVxuXHRcdFx0dmlkZW9b4LKgcGxheV0oKTtcblx0XHR9IGVsc2UgaWYgKGhhc0F1ZGlvICYmICFwbGF5ZXIuZHJpdmVyLmJ1ZmZlcmVkLmxlbmd0aCkge1xuXHRcdFx0Ly8gaWYgdGhlIGZpcnN0IHBsYXkgaXMgbmF0aXZlLFxuXHRcdFx0Ly8gdGhlIDxhdWRpbz4gbmVlZHMgdG8gYmUgYnVmZmVyZWQgbWFudWFsbHlcblx0XHRcdC8vIHNvIHdoZW4gdGhlIGZ1bGxzY3JlZW4gZW5kcywgaXQgY2FuIGJlIHNldCB0byB0aGUgc2FtZSBjdXJyZW50IHRpbWVcblx0XHRcdHBsYXllci5kcml2ZXIubG9hZCgpO1xuXHRcdH1cblx0fSk7XG5cdGlmIChoYXNBdWRpbykge1xuXHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdGVuZGZ1bGxzY3JlZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBzeW5jIGF1ZGlvIHRvIG5ldyB2aWRlbyBwb3NpdGlvblxuXHRcdFx0cGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9IHZpZGVvLmN1cnJlbnRUaW1lO1xuXHRcdFx0Ly8gY29uc29sZS5hc3NlcnQocGxheWVyLmRyaXZlci5jdXJyZW50VGltZSA9PT0gdmlkZW8uY3VycmVudFRpbWUsICdBdWRpbyBub3Qgc3luY2VkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBhbGxvdyBzZWVraW5nXG5cdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2luZycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmIChsYXN0UmVxdWVzdHMuaW5kZXhPZih2aWRlby5jdXJyZW50VGltZSAqIDEwMCB8IDAgLyAxMDApIDwgMCkge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnVXNlci1yZXF1ZXN0ZWQgc2Vla2luZycpO1xuXHRcdFx0XHRwbGF5ZXIuZHJpdmVyLmN1cnJlbnRUaW1lID0gdmlkZW8uY3VycmVudFRpbWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gb3ZlcmxvYWRBUEkodmlkZW8pIHtcblx0dmFyIHBsYXllciA9IHZpZGVvW+CyoF07XG5cdHZpZGVvW+CyoHBsYXldID0gdmlkZW8ucGxheTtcblx0dmlkZW9b4LKgcGF1c2VdID0gdmlkZW8ucGF1c2U7XG5cdHZpZGVvLnBsYXkgPSBwbGF5O1xuXHR2aWRlby5wYXVzZSA9IHBhdXNlO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAncGF1c2VkJywgcGxheWVyLmRyaXZlcik7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdtdXRlZCcsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAncGxheWJhY2tSYXRlJywgcGxheWVyLmRyaXZlciwgdHJ1ZSk7XG5cdHByb3h5UHJvcGVydHkodmlkZW8sICdlbmRlZCcsIHBsYXllci5kcml2ZXIpO1xuXHRwcm94eVByb3BlcnR5KHZpZGVvLCAnbG9vcCcsIHBsYXllci5kcml2ZXIsIHRydWUpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICdzZWVraW5nJyk7XG5cdHByZXZlbnRFdmVudCh2aWRlbywgJ3NlZWtlZCcpO1xuXHRwcmV2ZW50RXZlbnQodmlkZW8sICd0aW1ldXBkYXRlJywg4LKgZXZlbnQsIGZhbHNlKTtcblx0cHJldmVudEV2ZW50KHZpZGVvLCAnZW5kZWQnLCDgsqBldmVudCwgZmFsc2UpOyAvLyBwcmV2ZW50IG9jY2FzaW9uYWwgbmF0aXZlIGVuZGVkIGV2ZW50c1xufVxuXG5mdW5jdGlvbiBlbmFibGVJbmxpbmVWaWRlbyh2aWRlbykge1xuXHR2YXIgaGFzQXVkaW8gPSBhcmd1bWVudHMubGVuZ3RoIDw9IDEgfHwgYXJndW1lbnRzWzFdID09PSB1bmRlZmluZWQgPyB0cnVlIDogYXJndW1lbnRzWzFdO1xuXHR2YXIgb25seVdoZW5OZWVkZWQgPSBhcmd1bWVudHMubGVuZ3RoIDw9IDIgfHwgYXJndW1lbnRzWzJdID09PSB1bmRlZmluZWQgPyB0cnVlIDogYXJndW1lbnRzWzJdO1xuXG5cdGlmIChvbmx5V2hlbk5lZWRlZCAmJiAhaXNOZWVkZWQgfHwgdmlkZW9b4LKgXSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRhZGRQbGF5ZXIodmlkZW8sIGhhc0F1ZGlvKTtcblx0b3ZlcmxvYWRBUEkodmlkZW8pO1xuXHR2aWRlby5jbGFzc0xpc3QuYWRkKCdJSVYnKTtcblx0aWYgKCFoYXNBdWRpbyAmJiB2aWRlby5hdXRvcGxheSkge1xuXHRcdHZpZGVvLnBsYXkoKTtcblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVuYWJsZUlubGluZVZpZGVvOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNC8zLzE2LlxuICovXG5pbXBvcnQgRGV0ZWN0b3IgZnJvbSAnLi4vbGliL0RldGVjdG9yJztcbmltcG9ydCBNb2JpbGVCdWZmZXJpbmcgZnJvbSAnLi4vbGliL01vYmlsZUJ1ZmZlcmluZyc7XG5cbmNvbnN0IEhBVkVfRU5PVUdIX0RBVEEgPSA0O1xuXG52YXIgQ2FudmFzID0gZnVuY3Rpb24gKGJhc2VDb21wb25lbnQsIHNldHRpbmdzID0ge30pIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgYmFzZUNvbXBvbmVudC5jYWxsKHRoaXMsIHBsYXllciwgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIHRoaXMud2lkdGggPSBwbGF5ZXIuZWwoKS5vZmZzZXRXaWR0aCwgdGhpcy5oZWlnaHQgPSBwbGF5ZXIuZWwoKS5vZmZzZXRIZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLmxvbiA9IG9wdGlvbnMuaW5pdExvbiwgdGhpcy5sYXQgPSBvcHRpb25zLmluaXRMYXQsIHRoaXMucGhpID0gMCwgdGhpcy50aGV0YSA9IDA7XG4gICAgICAgICAgICB0aGlzLnZpZGVvVHlwZSA9IG9wdGlvbnMudmlkZW9UeXBlO1xuICAgICAgICAgICAgdGhpcy5jbGlja1RvVG9nZ2xlID0gb3B0aW9ucy5jbGlja1RvVG9nZ2xlO1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuaXNVc2VySW50ZXJhY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucGxheWVyID0gcGxheWVyO1xuICAgICAgICAgICAgLy9kZWZpbmUgc2NlbmVcbiAgICAgICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgICAgICAgICAgIC8vZGVmaW5lIGNhbWVyYVxuICAgICAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNzUsIHRoaXMud2lkdGggLyB0aGlzLmhlaWdodCwgMSwgMjAwMCk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQgPSBuZXcgVEhSRUUuVmVjdG9yMyggMCwgMCwgMCApO1xuICAgICAgICAgICAgLy9kZWZpbmUgcmVuZGVyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hdXRvQ2xlYXIgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q2xlYXJDb2xvcigweDAwMDAwMCwgMSk7XG5cbiAgICAgICAgICAgIC8vZGVmaW5lIHRleHR1cmVcbiAgICAgICAgICAgIHZhciB2aWRlbyA9IHNldHRpbmdzLmdldFRlY2gocGxheWVyKTtcbiAgICAgICAgICAgIHRoaXMuc3VwcG9ydFZpZGVvVGV4dHVyZSA9IERldGVjdG9yLnN1cHBvcnRWaWRlb1RleHR1cmUoKTtcbiAgICAgICAgICAgIGlmKCF0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUpe1xuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzID0gcGxheWVyLmFkZENoaWxkKFwiSGVscGVyQ2FudmFzXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgdmlkZW86IHZpZGVvLFxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmhlaWdodFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZXh0ID0gdGhpcy5oZWxwZXJDYW52YXMuZWwoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZShjb250ZXh0KTtcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZSA9IG5ldyBUSFJFRS5UZXh0dXJlKHZpZGVvKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmlkZW8uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXG4gICAgICAgICAgICB0aGlzLnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm1heEZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcbiAgICAgICAgICAgIHRoaXMudGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG4gICAgICAgICAgICAvL2RlZmluZSBnZW9tZXRyeVxuICAgICAgICAgICAgdmFyIGdlb21ldHJ5ID0gKHRoaXMudmlkZW9UeXBlID09PSBcImVxdWlyZWN0YW5ndWxhclwiKT8gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDUwMCwgNjAsIDQwKTogbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KCA1MDAsIDYwLCA0MCApLnRvTm9uSW5kZXhlZCgpO1xuICAgICAgICAgICAgaWYodGhpcy52aWRlb1R5cGUgPT09IFwiZmlzaGV5ZVwiKXtcbiAgICAgICAgICAgICAgICB2YXIgbm9ybWFscyA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMubm9ybWFsLmFycmF5O1xuICAgICAgICAgICAgICAgIHZhciB1dnMgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLnV2LmFycmF5O1xuICAgICAgICAgICAgICAgIGZvciAoIHZhciBpID0gMCwgbCA9IG5vcm1hbHMubGVuZ3RoIC8gMzsgaSA8IGw7IGkgKysgKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB4ID0gbm9ybWFsc1sgaSAqIDMgKyAwIF07XG4gICAgICAgICAgICAgICAgICAgIHZhciB5ID0gbm9ybWFsc1sgaSAqIDMgKyAxIF07XG4gICAgICAgICAgICAgICAgICAgIHZhciB6ID0gbm9ybWFsc1sgaSAqIDMgKyAyIF07XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHIgPSBNYXRoLmFzaW4oTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopIC8gTWF0aC5zcXJ0KHggKiB4ICArIHkgKiB5ICsgeiAqIHopKSAvIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGlmKHkgPCAwKSByID0gMSAtIHI7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGV0YSA9ICh4ID09IDAgJiYgeiA9PSAwKT8gMCA6IE1hdGguYWNvcyh4IC8gTWF0aC5zcXJ0KHggKiB4ICsgeiAqIHopKTtcbiAgICAgICAgICAgICAgICAgICAgaWYoeiA8IDApIHRoZXRhID0gdGhldGEgKiAtMTtcbiAgICAgICAgICAgICAgICAgICAgdXZzWyBpICogMiArIDAgXSA9IC0wLjggKiByICogTWF0aC5jb3ModGhldGEpICsgMC41O1xuICAgICAgICAgICAgICAgICAgICB1dnNbIGkgKiAyICsgMSBdID0gMC44ICogciAqIE1hdGguc2luKHRoZXRhKSArIDAuNTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkucm90YXRlWCggb3B0aW9ucy5yb3RhdGVYKTtcbiAgICAgICAgICAgICAgICBnZW9tZXRyeS5yb3RhdGVZKCBvcHRpb25zLnJvdGF0ZVkpO1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5LnJvdGF0ZVooIG9wdGlvbnMucm90YXRlWik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnZW9tZXRyeS5zY2FsZSggLSAxLCAxLCAxICk7XG4gICAgICAgICAgICAvL2RlZmluZSBtZXNoXG4gICAgICAgICAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRoaXMudGV4dHVyZX0pXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLy90aGlzLm1lc2guc2NhbGUueCA9IC0xO1xuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5tZXNoKTtcbiAgICAgICAgICAgIGlmKG9wdGlvbnMudnJFbmFibGUpe1xuICAgICAgICAgICAgICAgIHRoaXMudnJDb250cm9scyA9IG5ldyBUSFJFRS5PY3VsdXNSaWZ0Q29udHJvbHModGhpcy5jYW1lcmEpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHZyQ29udHJvbHMuZ2V0T2JqZWN0KCkpO1xuICAgICAgICAgICAgICAgIHRoaXMudnJFZmZlY3QgPSBuZXcgVEhSRUUuT2N1bHVzUmlmdEVmZmVjdCh0aGlzLnJlbmRlcmVyKTtcbiAgICAgICAgICAgICAgICB0aGlzLnZyc3RhdGUgPSBuZXcgdnIuU3RhdGUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnZydGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lbF8gPSB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQ7XG4gICAgICAgICAgICB0aGlzLmVsXy5jbGFzc0xpc3QuYWRkKCd2anMtdmlkZW8tY2FudmFzJyk7XG5cbiAgICAgICAgICAgIHRoaXMuYXR0YWNoQ29udHJvbEV2ZW50cygpO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGUoKTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgICAgICBpZihvcHRpb25zLmNhbGxiYWNrKSBvcHRpb25zLmNhbGxiYWNrKCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXR0YWNoQ29udHJvbEV2ZW50czogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMub24oJ21vdXNlbW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbigndG91Y2htb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bi5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoc3RhcnQnLHRoaXMuaGFuZGxlTW91c2VEb3duLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2V1cCcsIHRoaXMuaGFuZGxlTW91c2VVcC5iaW5kKHRoaXMpKTtcbiAgICAgICAgICAgIHRoaXMub24oJ3RvdWNoZW5kJywgdGhpcy5oYW5kbGVNb3VzZVVwLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgaWYodGhpcy5vcHRpb25zXy5zY3JvbGxhYmxlKXtcbiAgICAgICAgICAgICAgICB0aGlzLm9uKCdtb3VzZXdoZWVsJywgdGhpcy5oYW5kbGVNb3VzZVdoZWVsLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgICAgIHRoaXMub24oJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCB0aGlzLmhhbmRsZU1vdXNlV2hlZWwuYmluZCh0aGlzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLm9uKCdtb3VzZWVudGVyJywgdGhpcy5oYW5kbGVNb3VzZUVudGVyLmJpbmQodGhpcykpO1xuICAgICAgICAgICAgdGhpcy5vbignbW91c2VsZWF2ZScsIHRoaXMuaGFuZGxlTW91c2VMZWFzZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVSZXNpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMud2lkdGggPSB0aGlzLnBsYXllci5lbCgpLm9mZnNldFdpZHRoLCB0aGlzLmhlaWdodCA9IHRoaXMucGxheWVyLmVsKCkub2Zmc2V0SGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGhpcy53aWR0aCAvIHRoaXMuaGVpZ2h0O1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCApO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlVXA6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHRoaXMubW91c2VEb3duID0gZmFsc2U7XG4gICAgICAgICAgICBpZih0aGlzLmNsaWNrVG9Ub2dnbGUpe1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRYO1xuICAgICAgICAgICAgICAgIHZhciBjbGllbnRZID0gZXZlbnQuY2xpZW50WSB8fCBldmVudC5jaGFuZ2VkVG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgICAgIHZhciBkaWZmWCA9IE1hdGguYWJzKGNsaWVudFggLSB0aGlzLm9uUG9pbnRlckRvd25Qb2ludGVyWCk7XG4gICAgICAgICAgICAgICAgdmFyIGRpZmZZID0gTWF0aC5hYnMoY2xpZW50WSAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZKTtcbiAgICAgICAgICAgICAgICBpZihkaWZmWCA8IDAuMSAmJiBkaWZmWSA8IDAuMSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIucGF1c2VkKCkgPyB0aGlzLnBsYXllci5wbGF5KCkgOiB0aGlzLnBsYXllci5wYXVzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlRG93bjogZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgdGhpcy5tb3VzZURvd24gPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclggPSBjbGllbnRYO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duUG9pbnRlclkgPSBjbGllbnRZO1xuICAgICAgICAgICAgdGhpcy5vblBvaW50ZXJEb3duTG9uID0gdGhpcy5sb247XG4gICAgICAgICAgICB0aGlzLm9uUG9pbnRlckRvd25MYXQgPSB0aGlzLmxhdDtcbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb3VzZU1vdmU6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBjbGllbnRYID0gZXZlbnQuY2xpZW50WCB8fCBldmVudC50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgICAgICAgICB2YXIgY2xpZW50WSA9IGV2ZW50LmNsaWVudFkgfHwgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZO1xuICAgICAgICAgICAgaWYodGhpcy5vcHRpb25zXy5jbGlja0FuZERyYWcpe1xuICAgICAgICAgICAgICAgIGlmKHRoaXMubW91c2VEb3duKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPSAoIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJYIC0gY2xpZW50WCApICogMC4yICsgdGhpcy5vblBvaW50ZXJEb3duTG9uO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA9ICggY2xpZW50WSAtIHRoaXMub25Qb2ludGVyRG93blBvaW50ZXJZICkgKiAwLjIgKyB0aGlzLm9uUG9pbnRlckRvd25MYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgdmFyIHggPSBldmVudC5wYWdlWCAtIHRoaXMuZWxfLm9mZnNldExlZnQ7XG4gICAgICAgICAgICAgICAgdmFyIHkgPSBldmVudC5wYWdlWSAtIHRoaXMuZWxfLm9mZnNldFRvcDtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9ICh4IC8gdGhpcy53aWR0aCkgKiA0MzAgLSAyMjU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoeSAvIHRoaXMuaGVpZ2h0KSAqIC0xODAgKyA5MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBoYW5kbGVNb2JpbGVPcmllbnRhdGlvbjogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICBpZih0eXBlb2YgZXZlbnQucm90YXRpb25SYXRlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG4gICAgICAgICAgICB2YXIgeCA9IGV2ZW50LnJvdGF0aW9uUmF0ZS5hbHBoYTtcbiAgICAgICAgICAgIHZhciB5ID0gZXZlbnQucm90YXRpb25SYXRlLmJldGE7XG5cbiAgICAgICAgICAgIGlmICh3aW5kb3cubWF0Y2hNZWRpYShcIihvcmllbnRhdGlvbjogcG9ydHJhaXQpXCIpLm1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbiA9IHRoaXMubG9uIC0geSAqIHRoaXMub3B0aW9uc18ubW9iaWxlVmlicmF0aW9uVmFsdWU7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXQgPSB0aGlzLmxhdCArIHggKiB0aGlzLm9wdGlvbnNfLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgfWVsc2UgaWYod2luZG93Lm1hdGNoTWVkaWEoXCIob3JpZW50YXRpb246IGxhbmRzY2FwZSlcIikubWF0Y2hlcyl7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGF0aW9uRGVncmVlID0gLTkwO1xuICAgICAgICAgICAgICAgIGlmKHR5cGVvZiB3aW5kb3cub3JpZW50YXRpb24gIT0gXCJ1bmRlZmluZWRcIil7XG4gICAgICAgICAgICAgICAgICAgIG9yaWVudGF0aW9uRGVncmVlID0gd2luZG93Lm9yaWVudGF0aW9uO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKG9yaWVudGF0aW9uRGVncmVlID09IC05MCk/IHRoaXMubG9uICsgeCAqIHRoaXMub3B0aW9uc18ubW9iaWxlVmlicmF0aW9uVmFsdWUgOiB0aGlzLmxvbiAtIHggKiB0aGlzLm9wdGlvbnNfLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgICAgIHRoaXMubGF0ID0gKG9yaWVudGF0aW9uRGVncmVlID09IC05MCk/IHRoaXMubGF0ICsgeSAqIHRoaXMub3B0aW9uc18ubW9iaWxlVmlicmF0aW9uVmFsdWUgOiB0aGlzLmxhdCAtIHkgKiB0aGlzLm9wdGlvbnNfLm1vYmlsZVZpYnJhdGlvblZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlV2hlZWw6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIC8vIFdlYktpdFxuICAgICAgICAgICAgaWYgKCBldmVudC53aGVlbERlbHRhWSApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YVkgKiAwLjA1O1xuICAgICAgICAgICAgICAgIC8vIE9wZXJhIC8gRXhwbG9yZXIgOVxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQud2hlZWxEZWx0YSApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgLT0gZXZlbnQud2hlZWxEZWx0YSAqIDAuMDU7XG4gICAgICAgICAgICAgICAgLy8gRmlyZWZveFxuICAgICAgICAgICAgfSBlbHNlIGlmICggZXZlbnQuZGV0YWlsICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiArPSBldmVudC5kZXRhaWwgKiAxLjA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5mb3YgPSBNYXRoLm1pbih0aGlzLm9wdGlvbnNfLm1heEZvdiwgdGhpcy5jYW1lcmEuZm92KTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmZvdiA9IE1hdGgubWF4KHRoaXMub3B0aW9uc18ubWluRm92LCB0aGlzLmNhbWVyYS5mb3YpO1xuICAgICAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGhhbmRsZU1vdXNlRW50ZXI6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdGhpcy5pc1VzZXJJbnRlcmFjdGluZyA9IHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFuZGxlTW91c2VMZWFzZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLmlzVXNlckludGVyYWN0aW5nID0gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYW5pbWF0ZTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMucmVxdWVzdEFuaW1hdGlvbklkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCB0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSApO1xuICAgICAgICAgICAgaWYoIXRoaXMucGxheWVyLnBhdXNlZCgpKXtcbiAgICAgICAgICAgICAgICBpZih0eXBlb2YodGhpcy50ZXh0dXJlKSAhPT0gXCJ1bmRlZmluZWRcIiAmJiAoIXRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIucmVhZHlTdGF0ZSgpID09PSBIQVZFX0VOT1VHSF9EQVRBIHx8IHRoaXMuaXNQbGF5T25Nb2JpbGUgJiYgdGhpcy5wbGF5ZXIuaGFzQ2xhc3MoXCJ2anMtcGxheWluZ1wiKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdCAtIHRoaXMudGltZSA+PSAzMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlLm5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGltZSA9IGN0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmKHRoaXMuaXNQbGF5T25Nb2JpbGUpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnRUaW1lID0gdGhpcy5wbGF5ZXIuY3VycmVudFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKE1vYmlsZUJ1ZmZlcmluZy5pc0J1ZmZlcmluZyhjdXJyZW50VGltZSkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCF0aGlzLnBsYXllci5oYXNDbGFzcyhcInZqcy1wYW5vcmFtYS1tb2libGUtaW5saW5lLXZpZGVvLWJ1ZmZlcmluZ1wiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmFkZENsYXNzKFwidmpzLXBhbm9yYW1hLW1vaWJsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKHRoaXMucGxheWVyLmhhc0NsYXNzKFwidmpzLXBhbm9yYW1hLW1vaWJsZS1pbmxpbmUtdmlkZW8tYnVmZmVyaW5nXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIucmVtb3ZlQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9pYmxlLWlubGluZS12aWRlby1idWZmZXJpbmdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZih0aGlzLm9wdGlvbnNfLnZyRW5hYmxlKXtcbiAgICAgICAgICAgICAgICB2YXIgcG9sbGVkID0gdnIucG9sbFN0YXRlKHRoaXMudnJzdGF0ZSk7XG4gICAgICAgICAgICAgICAgdmFyIGN0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgdGhpcy52ckNvbnRyb2xzLnVwZGF0ZSggY3QgLSB0aGlzLnZydGltZSwgcG9sbGVkID8gdGhpcy52cnN0YXRlIDogbnVsbCApO1xuICAgICAgICAgICAgICAgIHRoaXMudnJ0aW1lID0gY3Q7XG4gICAgICAgICAgICAgICAgdGhpcy52ckVmZmVjdC5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhLCBwb2xsZWQgPyB0aGlzLnZyc3RhdGUgOiBudWxsICk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGlmKCF0aGlzLmlzVXNlckludGVyYWN0aW5nKXtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTGF0ID0gKHRoaXMubGF0ID4gdGhpcy5vcHRpb25zXy5pbml0TGF0KT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sTG9uID0gKHRoaXMubG9uID4gdGhpcy5vcHRpb25zXy5pbml0TG9uKT8gIC0xIDogMTtcbiAgICAgICAgICAgICAgICBpZih0aGlzLm9wdGlvbnNfLmJhY2tUb1ZlcnRpY2FsQ2VudGVyKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhdCA+ICh0aGlzLm9wdGlvbnNfLmluaXRMYXQgLSBNYXRoLmFicyh0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMYXQpKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXQgPCAodGhpcy5vcHRpb25zXy5pbml0TGF0ICsgTWF0aC5hYnModGhpcy5vcHRpb25zXy5yZXR1cm5TdGVwTGF0KSlcbiAgICAgICAgICAgICAgICAgICAgKT8gdGhpcy5vcHRpb25zXy5pbml0TGF0IDogdGhpcy5sYXQgKyB0aGlzLm9wdGlvbnNfLnJldHVyblN0ZXBMYXQgKiBzeW1ib2xMYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKHRoaXMub3B0aW9uc18uYmFja1RvSG9yaXpvbkNlbnRlcil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9uID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb24gPiAodGhpcy5vcHRpb25zXy5pbml0TG9uIC0gTWF0aC5hYnModGhpcy5vcHRpb25zXy5yZXR1cm5TdGVwTG9uKSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9uIDwgKHRoaXMub3B0aW9uc18uaW5pdExvbiArIE1hdGguYWJzKHRoaXMub3B0aW9uc18ucmV0dXJuU3RlcExvbikpXG4gICAgICAgICAgICAgICAgICAgICk/IHRoaXMub3B0aW9uc18uaW5pdExvbiA6IHRoaXMubG9uICsgdGhpcy5vcHRpb25zXy5yZXR1cm5TdGVwTG9uICogc3ltYm9sTG9uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMubGF0ID0gTWF0aC5tYXgoIHRoaXMub3B0aW9uc18ubWluTGF0LCBNYXRoLm1pbiggdGhpcy5vcHRpb25zXy5tYXhMYXQsIHRoaXMubGF0ICkgKTtcbiAgICAgICAgICAgIHRoaXMucGhpID0gVEhSRUUuTWF0aC5kZWdUb1JhZCggOTAgLSB0aGlzLmxhdCApO1xuICAgICAgICAgICAgdGhpcy50aGV0YSA9IFRIUkVFLk1hdGguZGVnVG9SYWQoIHRoaXMubG9uICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueCA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5jb3MoIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnRhcmdldC55ID0gNTAwICogTWF0aC5jb3MoIHRoaXMucGhpICk7XG4gICAgICAgICAgICB0aGlzLmNhbWVyYS50YXJnZXQueiA9IDUwMCAqIE1hdGguc2luKCB0aGlzLnBoaSApICogTWF0aC5zaW4oIHRoaXMudGhldGEgKTtcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmxvb2tBdCggdGhpcy5jYW1lcmEudGFyZ2V0ICk7XG5cbiAgICAgICAgICAgIGlmKCF0aGlzLnN1cHBvcnRWaWRlb1RleHR1cmUpe1xuICAgICAgICAgICAgICAgIHRoaXMuaGVscGVyQ2FudmFzLnVwZGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5jbGVhcigpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIoIHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhICk7XG4gICAgICAgIH0sXG4gICAgICAgIFxuICAgICAgICBwbGF5T25Nb2JpbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaXNQbGF5T25Nb2JpbGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYodGhpcy5vcHRpb25zXy5hdXRvTW9iaWxlT3JpZW50YXRpb24pXG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2RldmljZW1vdGlvbicsIHRoaXMuaGFuZGxlTW9iaWxlT3JpZW50YXRpb24uYmluZCh0aGlzKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZWw6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lbF87XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENhbnZhczsiLCIvKipcbiAqIEBhdXRob3IgYWx0ZXJlZHEgLyBodHRwOi8vYWx0ZXJlZHF1YWxpYS5jb20vXG4gKiBAYXV0aG9yIG1yLmRvb2IgLyBodHRwOi8vbXJkb29iLmNvbS9cbiAqL1xuXG52YXIgRGV0ZWN0b3IgPSB7XG5cbiAgICBjYW52YXM6ICEhIHdpbmRvdy5DYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gICAgd2ViZ2w6ICggZnVuY3Rpb24gKCkge1xuXG4gICAgICAgIHRyeSB7XG5cbiAgICAgICAgICAgIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnY2FudmFzJyApOyByZXR1cm4gISEgKCB3aW5kb3cuV2ViR0xSZW5kZXJpbmdDb250ZXh0ICYmICggY2FudmFzLmdldENvbnRleHQoICd3ZWJnbCcgKSB8fCBjYW52YXMuZ2V0Q29udGV4dCggJ2V4cGVyaW1lbnRhbC13ZWJnbCcgKSApICk7XG5cbiAgICAgICAgfSBjYXRjaCAoIGUgKSB7XG5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICB9XG5cbiAgICB9ICkoKSxcbiAgICB3b3JrZXJzOiAhISB3aW5kb3cuV29ya2VyLFxuICAgIGZpbGVhcGk6IHdpbmRvdy5GaWxlICYmIHdpbmRvdy5GaWxlUmVhZGVyICYmIHdpbmRvdy5GaWxlTGlzdCAmJiB3aW5kb3cuQmxvYixcblxuICAgICBDaGVja19WZXJzaW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgIHZhciBydiA9IC0xOyAvLyBSZXR1cm4gdmFsdWUgYXNzdW1lcyBmYWlsdXJlLlxuXG4gICAgICAgICBpZiAobmF2aWdhdG9yLmFwcE5hbWUgPT0gJ01pY3Jvc29mdCBJbnRlcm5ldCBFeHBsb3JlcicpIHtcblxuICAgICAgICAgICAgIHZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQsXG4gICAgICAgICAgICAgICAgIHJlID0gbmV3IFJlZ0V4cChcIk1TSUUgKFswLTldezEsfVtcXFxcLjAtOV17MCx9KVwiKTtcblxuICAgICAgICAgICAgIGlmIChyZS5leGVjKHVhKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICBydiA9IHBhcnNlRmxvYXQoUmVnRXhwLiQxKTtcbiAgICAgICAgICAgICB9XG4gICAgICAgICB9XG4gICAgICAgICBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwTmFtZSA9PSBcIk5ldHNjYXBlXCIpIHtcbiAgICAgICAgICAgICAvLy8gaW4gSUUgMTEgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIHNheXMgJ3RyaWRlbnQnXG4gICAgICAgICAgICAgLy8vIGluIEVkZ2UgdGhlIG5hdmlnYXRvci5hcHBWZXJzaW9uIGRvZXMgbm90IHNheSB0cmlkZW50XG4gICAgICAgICAgICAgaWYgKG5hdmlnYXRvci5hcHBWZXJzaW9uLmluZGV4T2YoJ1RyaWRlbnQnKSAhPT0gLTEpIHJ2ID0gMTE7XG4gICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudDtcbiAgICAgICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cChcIkVkZ2VcXC8oWzAtOV17MSx9W1xcXFwuMC05XXswLH0pXCIpO1xuICAgICAgICAgICAgICAgICBpZiAocmUuZXhlYyh1YSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgIHJ2ID0gcGFyc2VGbG9hdChSZWdFeHAuJDEpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgfVxuXG4gICAgICAgICByZXR1cm4gcnY7XG4gICAgIH0sXG5cbiAgICBzdXBwb3J0VmlkZW9UZXh0dXJlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vaWUgMTEgYW5kIGVkZ2UgMTIgZG9lc24ndCBzdXBwb3J0IHZpZGVvIHRleHR1cmUuXG4gICAgICAgIHZhciB2ZXJzaW9uID0gdGhpcy5DaGVja19WZXJzaW9uKCk7XG4gICAgICAgIHJldHVybiAodmVyc2lvbiA9PT0gLTEgfHwgdmVyc2lvbiA+PSAxMyk7XG4gICAgfSxcblxuICAgIGdldFdlYkdMRXJyb3JNZXNzYWdlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgICAgICBlbGVtZW50LmlkID0gJ3dlYmdsLWVycm9yLW1lc3NhZ2UnO1xuXG4gICAgICAgIGlmICggISB0aGlzLndlYmdsICkge1xuXG4gICAgICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IHdpbmRvdy5XZWJHTFJlbmRlcmluZ0NvbnRleHQgPyBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgZ3JhcGhpY3MgY2FyZCBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIgLz4nLFxuICAgICAgICAgICAgICAgICdGaW5kIG91dCBob3cgdG8gZ2V0IGl0IDxhIGhyZWY9XCJodHRwOi8vZ2V0LndlYmdsLm9yZy9cIiBzdHlsZT1cImNvbG9yOiMwMDBcIj5oZXJlPC9hPi4nXG4gICAgICAgICAgICBdLmpvaW4oICdcXG4nICkgOiBbXG4gICAgICAgICAgICAgICAgJ1lvdXIgYnJvd3NlciBkb2VzIG5vdCBzZWVtIHRvIHN1cHBvcnQgPGEgaHJlZj1cImh0dHA6Ly9raHJvbm9zLm9yZy93ZWJnbC93aWtpL0dldHRpbmdfYV9XZWJHTF9JbXBsZW1lbnRhdGlvblwiIHN0eWxlPVwiY29sb3I6IzAwMFwiPldlYkdMPC9hPi48YnIvPicsXG4gICAgICAgICAgICAgICAgJ0ZpbmQgb3V0IGhvdyB0byBnZXQgaXQgPGEgaHJlZj1cImh0dHA6Ly9nZXQud2ViZ2wub3JnL1wiIHN0eWxlPVwiY29sb3I6IzAwMFwiPmhlcmU8L2E+LidcbiAgICAgICAgICAgIF0uam9pbiggJ1xcbicgKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG5cbiAgICB9LFxuXG4gICAgYWRkR2V0V2ViR0xNZXNzYWdlOiBmdW5jdGlvbiAoIHBhcmFtZXRlcnMgKSB7XG5cbiAgICAgICAgdmFyIHBhcmVudCwgaWQsIGVsZW1lbnQ7XG5cbiAgICAgICAgcGFyYW1ldGVycyA9IHBhcmFtZXRlcnMgfHwge307XG5cbiAgICAgICAgcGFyZW50ID0gcGFyYW1ldGVycy5wYXJlbnQgIT09IHVuZGVmaW5lZCA/IHBhcmFtZXRlcnMucGFyZW50IDogZG9jdW1lbnQuYm9keTtcbiAgICAgICAgaWQgPSBwYXJhbWV0ZXJzLmlkICE9PSB1bmRlZmluZWQgPyBwYXJhbWV0ZXJzLmlkIDogJ29sZGllJztcblxuICAgICAgICBlbGVtZW50ID0gRGV0ZWN0b3IuZ2V0V2ViR0xFcnJvck1lc3NhZ2UoKTtcbiAgICAgICAgZWxlbWVudC5pZCA9IGlkO1xuXG4gICAgICAgIHBhcmVudC5hcHBlbmRDaGlsZCggZWxlbWVudCApO1xuXG4gICAgfVxuXG59O1xuXG4vLyBicm93c2VyaWZ5IHN1cHBvcnRcbmlmICggdHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgKSB7XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IERldGVjdG9yO1xuXG59IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHdlbnNoZW5nLnlhbiBvbiA1LzIzLzE2LlxuICovXG52YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1oZWxwZXItY2FudmFzXCI7XG5cbnZhciBIZWxwZXJDYW52YXMgPSBmdW5jdGlvbihiYXNlQ29tcG9uZW50KXtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gaW5pdChwbGF5ZXIsIG9wdGlvbnMpe1xuICAgICAgICAgICAgdGhpcy52aWRlb0VsZW1lbnQgPSBvcHRpb25zLnZpZGVvO1xuICAgICAgICAgICAgdGhpcy53aWR0aCA9IG9wdGlvbnMud2lkdGg7XG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0O1xuXG4gICAgICAgICAgICBlbGVtZW50LndpZHRoID0gdGhpcy53aWR0aDtcbiAgICAgICAgICAgIGVsZW1lbnQuaGVpZ2h0ID0gdGhpcy5oZWlnaHQ7XG4gICAgICAgICAgICBlbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgICAgIG9wdGlvbnMuZWwgPSBlbGVtZW50O1xuXG5cbiAgICAgICAgICAgIHRoaXMuY29udGV4dCA9IGVsZW1lbnQuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5kcmF3SW1hZ2UodGhpcy52aWRlb0VsZW1lbnQsIDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuICAgICAgICBcbiAgICAgICAgZ2V0Q29udGV4dDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQ7ICBcbiAgICAgICAgfSxcbiAgICAgICAgXG4gICAgICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRyYXdJbWFnZSh0aGlzLnZpZGVvRWxlbWVudCwgMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSGVscGVyQ2FudmFzOyIsIi8qKlxuICogQ3JlYXRlZCBieSB5YW53c2ggb24gNi82LzE2LlxuICovXG52YXIgTW9iaWxlQnVmZmVyaW5nID0ge1xuICAgIHByZXZfY3VycmVudFRpbWU6IDAsXG4gICAgY291bnRlcjogMCxcbiAgICBcbiAgICBpc0J1ZmZlcmluZzogZnVuY3Rpb24gKGN1cnJlbnRUaW1lKSB7XG4gICAgICAgIGlmIChjdXJyZW50VGltZSA9PSB0aGlzLnByZXZfY3VycmVudFRpbWUpIHRoaXMuY291bnRlcisrO1xuICAgICAgICBlbHNlIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucHJldl9jdXJyZW50VGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICBpZih0aGlzLmNvdW50ZXIgPiAxMCl7XG4gICAgICAgICAgICAvL25vdCBsZXQgY291bnRlciBvdmVyZmxvd1xuICAgICAgICAgICAgdGhpcy5jb3VudGVyID0gMTA7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBNb2JpbGVCdWZmZXJpbmc7IiwiLyoqXG4gKiBDcmVhdGVkIGJ5IHlhbndzaCBvbiA0LzQvMTYuXG4gKi9cblxudmFyIE5vdGljZSA9IGZ1bmN0aW9uKGJhc2VDb21wb25lbnQpe1xuICAgIHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZWxlbWVudC5jbGFzc05hbWUgPSBcInZqcy12aWRlby1ub3RpY2UtbGFiZWxcIjtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGNvbnN0cnVjdG9yOiBmdW5jdGlvbiBpbml0KHBsYXllciwgb3B0aW9ucyl7XG4gICAgICAgICAgICBpZih0eXBlb2Ygb3B0aW9ucy5Ob3RpY2VNZXNzYWdlID09IFwib2JqZWN0XCIpe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IG9wdGlvbnMuTm90aWNlTWVzc2FnZTtcbiAgICAgICAgICAgIH1lbHNlIGlmKHR5cGVvZiBvcHRpb25zLk5vdGljZU1lc3NhZ2UgPT0gXCJzdHJpbmdcIil7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5pbm5lckhUTUwgPSBvcHRpb25zLk5vdGljZU1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5lbCA9IGVsZW1lbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJhc2VDb21wb25lbnQuY2FsbCh0aGlzLCBwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTm90aWNlOyIsIi8qKlxuICogQ3JlYXRlZCBieSB3ZW5zaGVuZy55YW4gb24gNC80LzE2LlxuICovXG5mdW5jdGlvbiB3aGljaFRyYW5zaXRpb25FdmVudCgpe1xuICAgIHZhciB0O1xuICAgIHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zha2VlbGVtZW50Jyk7XG4gICAgdmFyIHRyYW5zaXRpb25zID0ge1xuICAgICAgICAndHJhbnNpdGlvbic6J3RyYW5zaXRpb25lbmQnLFxuICAgICAgICAnT1RyYW5zaXRpb24nOidvVHJhbnNpdGlvbkVuZCcsXG4gICAgICAgICdNb3pUcmFuc2l0aW9uJzondHJhbnNpdGlvbmVuZCcsXG4gICAgICAgICdXZWJraXRUcmFuc2l0aW9uJzond2Via2l0VHJhbnNpdGlvbkVuZCdcbiAgICB9O1xuXG4gICAgZm9yKHQgaW4gdHJhbnNpdGlvbnMpe1xuICAgICAgICBpZiggZWwuc3R5bGVbdF0gIT09IHVuZGVmaW5lZCApe1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zaXRpb25zW3RdO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtb2JpbGVBbmRUYWJsZXRjaGVjaygpIHtcbiAgICB2YXIgY2hlY2sgPSBmYWxzZTtcbiAgICAoZnVuY3Rpb24oYSl7aWYoLyhhbmRyb2lkfGJiXFxkK3xtZWVnbykuK21vYmlsZXxhdmFudGdvfGJhZGFcXC98YmxhY2tiZXJyeXxibGF6ZXJ8Y29tcGFsfGVsYWluZXxmZW5uZWN8aGlwdG9wfGllbW9iaWxlfGlwKGhvbmV8b2QpfGlyaXN8a2luZGxlfGxnZSB8bWFlbW98bWlkcHxtbXB8bW9iaWxlLitmaXJlZm94fG5ldGZyb250fG9wZXJhIG0ob2J8aW4paXxwYWxtKCBvcyk/fHBob25lfHAoaXhpfHJlKVxcL3xwbHVja2VyfHBvY2tldHxwc3B8c2VyaWVzKDR8NikwfHN5bWJpYW58dHJlb3x1cFxcLihicm93c2VyfGxpbmspfHZvZGFmb25lfHdhcHx3aW5kb3dzIGNlfHhkYXx4aWlub3xhbmRyb2lkfGlwYWR8cGxheWJvb2t8c2lsay9pLnRlc3QoYSl8fC8xMjA3fDYzMTB8NjU5MHwzZ3NvfDR0aHB8NTBbMS02XWl8Nzcwc3w4MDJzfGEgd2F8YWJhY3xhYyhlcnxvb3xzXFwtKXxhaShrb3xybil8YWwoYXZ8Y2F8Y28pfGFtb2l8YW4oZXh8bnl8eXcpfGFwdHV8YXIoY2h8Z28pfGFzKHRlfHVzKXxhdHR3fGF1KGRpfFxcLW18ciB8cyApfGF2YW58YmUoY2t8bGx8bnEpfGJpKGxifHJkKXxibChhY3xheil8YnIoZXx2KXd8YnVtYnxid1xcLShufHUpfGM1NVxcL3xjYXBpfGNjd2F8Y2RtXFwtfGNlbGx8Y2h0bXxjbGRjfGNtZFxcLXxjbyhtcHxuZCl8Y3Jhd3xkYShpdHxsbHxuZyl8ZGJ0ZXxkY1xcLXN8ZGV2aXxkaWNhfGRtb2J8ZG8oY3xwKW98ZHMoMTJ8XFwtZCl8ZWwoNDl8YWkpfGVtKGwyfHVsKXxlcihpY3xrMCl8ZXNsOHxleihbNC03XTB8b3N8d2F8emUpfGZldGN8Zmx5KFxcLXxfKXxnMSB1fGc1NjB8Z2VuZXxnZlxcLTV8Z1xcLW1vfGdvKFxcLnd8b2QpfGdyKGFkfHVuKXxoYWllfGhjaXR8aGRcXC0obXxwfHQpfGhlaVxcLXxoaShwdHx0YSl8aHAoIGl8aXApfGhzXFwtY3xodChjKFxcLXwgfF98YXxnfHB8c3x0KXx0cCl8aHUoYXd8dGMpfGlcXC0oMjB8Z298bWEpfGkyMzB8aWFjKCB8XFwtfFxcLyl8aWJyb3xpZGVhfGlnMDF8aWtvbXxpbTFrfGlubm98aXBhcXxpcmlzfGphKHR8dilhfGpicm98amVtdXxqaWdzfGtkZGl8a2VqaXxrZ3QoIHxcXC8pfGtsb258a3B0IHxrd2NcXC18a3lvKGN8ayl8bGUobm98eGkpfGxnKCBnfFxcLyhrfGx8dSl8NTB8NTR8XFwtW2Etd10pfGxpYnd8bHlueHxtMVxcLXd8bTNnYXxtNTBcXC98bWEodGV8dWl8eG8pfG1jKDAxfDIxfGNhKXxtXFwtY3J8bWUocmN8cmkpfG1pKG84fG9hfHRzKXxtbWVmfG1vKDAxfDAyfGJpfGRlfGRvfHQoXFwtfCB8b3x2KXx6eil8bXQoNTB8cDF8diApfG13YnB8bXl3YXxuMTBbMC0yXXxuMjBbMi0zXXxuMzAoMHwyKXxuNTAoMHwyfDUpfG43KDAoMHwxKXwxMCl8bmUoKGN8bSlcXC18b258dGZ8d2Z8d2d8d3QpfG5vayg2fGkpfG56cGh8bzJpbXxvcCh0aXx3dil8b3Jhbnxvd2cxfHA4MDB8cGFuKGF8ZHx0KXxwZHhnfHBnKDEzfFxcLShbMS04XXxjKSl8cGhpbHxwaXJlfHBsKGF5fHVjKXxwblxcLTJ8cG8oY2t8cnR8c2UpfHByb3h8cHNpb3xwdFxcLWd8cWFcXC1hfHFjKDA3fDEyfDIxfDMyfDYwfFxcLVsyLTddfGlcXC0pfHF0ZWt8cjM4MHxyNjAwfHJha3N8cmltOXxybyh2ZXx6byl8czU1XFwvfHNhKGdlfG1hfG1tfG1zfG55fHZhKXxzYygwMXxoXFwtfG9vfHBcXC0pfHNka1xcL3xzZShjKFxcLXwwfDEpfDQ3fG1jfG5kfHJpKXxzZ2hcXC18c2hhcnxzaWUoXFwtfG0pfHNrXFwtMHxzbCg0NXxpZCl8c20oYWx8YXJ8YjN8aXR8dDUpfHNvKGZ0fG55KXxzcCgwMXxoXFwtfHZcXC18diApfHN5KDAxfG1iKXx0MigxOHw1MCl8dDYoMDB8MTB8MTgpfHRhKGd0fGxrKXx0Y2xcXC18dGRnXFwtfHRlbChpfG0pfHRpbVxcLXx0XFwtbW98dG8ocGx8c2gpfHRzKDcwfG1cXC18bTN8bTUpfHR4XFwtOXx1cChcXC5ifGcxfHNpKXx1dHN0fHY0MDB8djc1MHx2ZXJpfHZpKHJnfHRlKXx2ayg0MHw1WzAtM118XFwtdil8dm00MHx2b2RhfHZ1bGN8dngoNTJ8NTN8NjB8NjF8NzB8ODB8ODF8ODN8ODV8OTgpfHczYyhcXC18ICl8d2ViY3x3aGl0fHdpKGcgfG5jfG53KXx3bWxifHdvbnV8eDcwMHx5YXNcXC18eW91cnx6ZXRvfHp0ZVxcLS9pLnRlc3QoYS5zdWJzdHIoMCw0KSkpY2hlY2sgPSB0cnVlfSkobmF2aWdhdG9yLnVzZXJBZ2VudHx8bmF2aWdhdG9yLnZlbmRvcnx8d2luZG93Lm9wZXJhKTtcbiAgICByZXR1cm4gY2hlY2s7XG59XG5cbmZ1bmN0aW9uIGlzSW9zKCkge1xuICAgIHJldHVybiAvaVBob25lfGlQYWR8aVBvZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG59XG5cbmZ1bmN0aW9uIGlzUmVhbElwaG9uZSgpIHtcbiAgICByZXR1cm4gL2lQaG9uZXxpUG9kL2kudGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICB3aGljaFRyYW5zaXRpb25FdmVudDogd2hpY2hUcmFuc2l0aW9uRXZlbnQsXG4gICAgbW9iaWxlQW5kVGFibGV0Y2hlY2s6IG1vYmlsZUFuZFRhYmxldGNoZWNrLFxuICAgIGlzSW9zOiBpc0lvcyxcbiAgICBpc1JlYWxJcGhvbmU6IGlzUmVhbElwaG9uZVxufTsiLCIvKipcbiAqIENyZWF0ZWQgYnkgeWFud3NoIG9uIDQvMy8xNi5cbiAqL1xuJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgdXRpbCBmcm9tICcuL2xpYi9VdGlsJztcbmltcG9ydCBEZXRlY3RvciBmcm9tICcuL2xpYi9EZXRlY3Rvcic7XG5pbXBvcnQgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUgZnJvbSAnaXBob25lLWlubGluZS12aWRlbyc7XG5cbmNvbnN0IHJ1bk9uTW9iaWxlID0gKHV0aWwubW9iaWxlQW5kVGFibGV0Y2hlY2soKSk7XG5cbi8vIERlZmF1bHQgb3B0aW9ucyBmb3IgdGhlIHBsdWdpbi5cbmNvbnN0IGRlZmF1bHRzID0ge1xuICAgIGNsaWNrQW5kRHJhZzogcnVuT25Nb2JpbGUsXG4gICAgc2hvd05vdGljZTogdHJ1ZSxcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlBsZWFzZSB1c2UgeW91ciBtb3VzZSBkcmFnIGFuZCBkcm9wIHRoZSB2aWRlby5cIixcbiAgICBhdXRvSGlkZU5vdGljZTogMzAwMCxcbiAgICAvL2xpbWl0IHRoZSB2aWRlbyBzaXplIHdoZW4gdXNlciBzY3JvbGwuXG4gICAgc2Nyb2xsYWJsZTogdHJ1ZSxcbiAgICBtYXhGb3Y6IDEwNSxcbiAgICBtaW5Gb3Y6IDUxLFxuICAgIC8vaW5pdGlhbCBwb3NpdGlvbiBmb3IgdGhlIHZpZGVvXG4gICAgaW5pdExhdDogMCxcbiAgICBpbml0TG9uOiAtMTgwLFxuICAgIC8vQSBmbG9hdCB2YWx1ZSBiYWNrIHRvIGNlbnRlciB3aGVuIG1vdXNlIG91dCB0aGUgY2FudmFzLiBUaGUgaGlnaGVyLCB0aGUgZmFzdGVyLlxuICAgIHJldHVyblN0ZXBMYXQ6IDAuNSxcbiAgICByZXR1cm5TdGVwTG9uOiAyLFxuICAgIGJhY2tUb1ZlcnRpY2FsQ2VudGVyOiAhcnVuT25Nb2JpbGUsXG4gICAgYmFja1RvSG9yaXpvbkNlbnRlcjogIXJ1bk9uTW9iaWxlLFxuICAgIGNsaWNrVG9Ub2dnbGU6IGZhbHNlLFxuICAgIFxuICAgIC8vbGltaXQgdmlld2FibGUgem9vbVxuICAgIG1pbkxhdDogLTg1LFxuICAgIG1heExhdDogODUsXG4gICAgdmlkZW9UeXBlOiBcImVxdWlyZWN0YW5ndWxhclwiLFxuICAgIFxuICAgIHJvdGF0ZVg6IDAsXG4gICAgcm90YXRlWTogMCxcbiAgICByb3RhdGVaOiAwLFxuICAgIFxuICAgIGF1dG9Nb2JpbGVPcmllbnRhdGlvbjogZmFsc2UsXG4gICAgbW9iaWxlVmlicmF0aW9uVmFsdWU6IHV0aWwuaXNJb3MoKT8gMC4wMjIgOiAxLFxuXG4gICAgdnJFbmFibGU6IGZhbHNlXG59O1xuXG4vKipcbiAqIEZ1bmN0aW9uIHRvIGludm9rZSB3aGVuIHRoZSBwbGF5ZXIgaXMgcmVhZHkuXG4gKlxuICogVGhpcyBpcyBhIGdyZWF0IHBsYWNlIGZvciB5b3VyIHBsdWdpbiB0byBpbml0aWFsaXplIGl0c2VsZi4gV2hlbiB0aGlzXG4gKiBmdW5jdGlvbiBpcyBjYWxsZWQsIHRoZSBwbGF5ZXIgd2lsbCBoYXZlIGl0cyBET00gYW5kIGNoaWxkIGNvbXBvbmVudHNcbiAqIGluIHBsYWNlLlxuICpcbiAqIEBmdW5jdGlvbiBvblBsYXllclJlYWR5XG4gKiBAcGFyYW0gICAge1BsYXllcn0gcGxheWVyXG4gKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gKi9cbmNvbnN0IG9uUGxheWVyUmVhZHkgPSAocGxheWVyLCBvcHRpb25zLCBzZXR0aW5ncykgPT4ge1xuICAgIHBsYXllci5hZGRDbGFzcygndmpzLXBhbm9yYW1hJyk7XG4gICAgaWYoIURldGVjdG9yLndlYmdsKXtcbiAgICAgICAgUG9wdXBOb3RpZmljYXRpb24ocGxheWVyLCB7XG4gICAgICAgICAgICBOb3RpY2VNZXNzYWdlOiBEZXRlY3Rvci5nZXRXZWJHTEVycm9yTWVzc2FnZSgpLFxuICAgICAgICAgICAgYXV0b0hpZGVOb3RpY2U6IG9wdGlvbnMuYXV0b0hpZGVOb3RpY2VcbiAgICAgICAgfSk7XG4gICAgICAgIGlmKG9wdGlvbnMuY2FsbGJhY2spe1xuICAgICAgICAgICAgb3B0aW9ucy5jYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcGxheWVyLmFkZENoaWxkKCdDYW52YXMnLCBvcHRpb25zKTtcbiAgICB2YXIgY2FudmFzID0gcGxheWVyLmdldENoaWxkKCdDYW52YXMnKTtcbiAgICBpZihydW5Pbk1vYmlsZSl7XG4gICAgICAgIHZhciB2aWRlb0VsZW1lbnQgPSBzZXR0aW5ncy5nZXRUZWNoKHBsYXllcik7XG4gICAgICAgIGlmKHV0aWwuaXNSZWFsSXBob25lKCkpe1xuICAgICAgICAgICAgbWFrZVZpZGVvUGxheWFibGVJbmxpbmUodmlkZW9FbGVtZW50LCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBwbGF5ZXIuYWRkQ2xhc3MoXCJ2anMtcGFub3JhbWEtbW9pYmxlLWlubGluZS12aWRlb1wiKTtcbiAgICAgICAgY2FudmFzLnBsYXlPbk1vYmlsZSgpO1xuICAgIH1cbiAgICBpZihvcHRpb25zLnNob3dOb3RpY2Upe1xuICAgICAgICBwbGF5ZXIub24oXCJwbGF5aW5nXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBQb3B1cE5vdGlmaWNhdGlvbihwbGF5ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgY2FudmFzLmhpZGUoKTtcbiAgICBwbGF5ZXIub24oXCJwbGF5XCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2FudmFzLnNob3coKTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IFBvcHVwTm90aWZpY2F0aW9uID0gKHBsYXllciwgb3B0aW9ucyA9IHtcbiAgICBOb3RpY2VNZXNzYWdlOiBcIlwiXG59KSA9PiB7XG4gICAgdmFyIG5vdGljZSA9IHBsYXllci5hZGRDaGlsZCgnTm90aWNlJywgb3B0aW9ucyk7XG5cbiAgICBpZihvcHRpb25zLmF1dG9IaWRlTm90aWNlID4gMCl7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbm90aWNlLmFkZENsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgdmFyIHRyYW5zaXRpb25FdmVudCA9IHV0aWwud2hpY2hUcmFuc2l0aW9uRXZlbnQoKTtcbiAgICAgICAgICAgIHZhciBoaWRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5vdGljZS5oaWRlKCk7XG4gICAgICAgICAgICAgICAgbm90aWNlLnJlbW92ZUNsYXNzKFwidmpzLXZpZGVvLW5vdGljZS1mYWRlT3V0XCIpO1xuICAgICAgICAgICAgICAgIG5vdGljZS5vZmYodHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBub3RpY2Uub24odHJhbnNpdGlvbkV2ZW50LCBoaWRlKTtcbiAgICAgICAgfSwgb3B0aW9ucy5hdXRvSGlkZU5vdGljZSk7XG4gICAgfVxufTtcblxuY29uc3QgcGx1Z2luID0gZnVuY3Rpb24oc2V0dGluZ3MgPSB7fSl7XG4gICAgLyoqXG4gICAgICogQSB2aWRlby5qcyBwbHVnaW4uXG4gICAgICpcbiAgICAgKiBJbiB0aGUgcGx1Z2luIGZ1bmN0aW9uLCB0aGUgdmFsdWUgb2YgYHRoaXNgIGlzIGEgdmlkZW8uanMgYFBsYXllcmBcbiAgICAgKiBpbnN0YW5jZS4gWW91IGNhbm5vdCByZWx5IG9uIHRoZSBwbGF5ZXIgYmVpbmcgaW4gYSBcInJlYWR5XCIgc3RhdGUgaGVyZSxcbiAgICAgKiBkZXBlbmRpbmcgb24gaG93IHRoZSBwbHVnaW4gaXMgaW52b2tlZC4gVGhpcyBtYXkgb3IgbWF5IG5vdCBiZSBpbXBvcnRhbnRcbiAgICAgKiB0byB5b3U7IGlmIG5vdCwgcmVtb3ZlIHRoZSB3YWl0IGZvciBcInJlYWR5XCIhXG4gICAgICpcbiAgICAgKiBAZnVuY3Rpb24gcGFub3JhbWFcbiAgICAgKiBAcGFyYW0gICAge09iamVjdH0gW29wdGlvbnM9e31dXG4gICAgICogICAgICAgICAgIEFuIG9iamVjdCBvZiBvcHRpb25zIGxlZnQgdG8gdGhlIHBsdWdpbiBhdXRob3IgdG8gZGVmaW5lLlxuICAgICAqL1xuICAgIGNvbnN0IHZpZGVvVHlwZXMgPSBbXCJlcXVpcmVjdGFuZ3VsYXJcIiwgXCJmaXNoZXllXCJdO1xuICAgIGNvbnN0IHBhbm9yYW1hID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICBpZihzZXR0aW5ncy5tZXJnZU9wdGlvbikgb3B0aW9ucyA9IHNldHRpbmdzLm1lcmdlT3B0aW9uKGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICAgICAgaWYodmlkZW9UeXBlcy5pbmRleE9mKG9wdGlvbnMudmlkZW9UeXBlKSA9PSAtMSkgZGVmYXVsdHMudmlkZW9UeXBlO1xuICAgICAgICAvL2NoZWNrIHZyIHN1cHBvcnRcbiAgICAgICAgaWYodHlwZW9mIHZyICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICAgICAgICAgIG9wdGlvbnMudnJFbmFibGUgPSB0cnVlO1xuICAgICAgICAgICAgaWYoIXZyLmlzSW5zdGFsbGVkKCkpe1xuICAgICAgICAgICAgICAgIG9wdGlvbnMudnJFbmFibGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdOUFZSIHBsdWdpbiBub3QgaW5zdGFsbGVkIScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdnIubG9hZChmdW5jdGlvbihlcnJvcil7XG4gICAgICAgICAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgICAgICAgICBvcHRpb25zLnZyRW5hYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1BsdWdpbiBsb2FkIGZhaWxlZDogJyArIGVycm9yLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucmVhZHkoKCkgPT4ge1xuICAgICAgICAgICAgb25QbGF5ZXJSZWFkeSh0aGlzLCBvcHRpb25zLCBzZXR0aW5ncyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbi8vIEluY2x1ZGUgdGhlIHZlcnNpb24gbnVtYmVyLlxuICAgIHBhbm9yYW1hLlZFUlNJT04gPSAnMC4wLjYnO1xuXG4gICAgcmV0dXJuIHBhbm9yYW1hO1xufVxuXG5leHBvcnQgZGVmYXVsdCBwbHVnaW47IiwiJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQgQ2FudmFzICBmcm9tICcuL2xpYi9DYW52YXMnO1xuaW1wb3J0IE5vdGljZSAgZnJvbSAnLi9saWIvTm90aWNlJztcbmltcG9ydCBIZWxwZXJDYW52YXMgZnJvbSAnLi9saWIvSGVscGVyQ2FudmFzJztcbmltcG9ydCBwYW5vcmFtYSBmcm9tICcuL3BsdWdpbic7XG5cbmZ1bmN0aW9uIGdldFRlY2gocGxheWVyKSB7XG4gICAgcmV0dXJuIHBsYXllci50ZWNoKHsgSVdpbGxOb3RVc2VUaGlzSW5QbHVnaW5zOiB0cnVlIH0pLmVsKCk7XG59XG5cbnZhciBjb21wb25lbnQgPSB2aWRlb2pzLmdldENvbXBvbmVudCgnQ29tcG9uZW50Jyk7XG52YXIgY2FudmFzID0gQ2FudmFzKGNvbXBvbmVudCwge1xuICAgIGdldFRlY2g6IGdldFRlY2hcbn0pO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBjYW52YXMpKTtcblxudmFyIG5vdGljZSA9IE5vdGljZShjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnTm90aWNlJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBub3RpY2UpKTtcblxudmFyIGhlbHBlckNhbnZhcyA9IEhlbHBlckNhbnZhcyhjb21wb25lbnQpO1xudmlkZW9qcy5yZWdpc3RlckNvbXBvbmVudCgnSGVscGVyQ2FudmFzJywgdmlkZW9qcy5leHRlbmQoY29tcG9uZW50LCBoZWxwZXJDYW52YXMpKTtcblxuLy8gUmVnaXN0ZXIgdGhlIHBsdWdpbiB3aXRoIHZpZGVvLmpzLlxuXG52aWRlb2pzLnBsdWdpbigncGFub3JhbWEnLCBwYW5vcmFtYSh7XG4gICAgbWVyZ2VPcHRpb246IGZ1bmN0aW9uIChkZWZhdWx0cywgb3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdmlkZW9qcy5tZXJnZU9wdGlvbnMoZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgIH0sXG4gICAgZ2V0VGVjaDogZ2V0VGVjaFxufSkpO1xuIl19
