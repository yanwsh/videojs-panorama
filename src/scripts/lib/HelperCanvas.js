/**
 * Created by wensheng.yan on 5/23/16.
 */
var element = document.createElement('canvas');
element.className = "vjs-video-helper-canvas";

var HelperCanvas = function(baseComponent){
    return {
        constructor: function init(player, options){
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
        
        getContext: function () {
          return this.context;  
        },
        
        update: function () {
            this.context.drawImage(this.videoElement, 0, 0, this.width, this.height);
        },

        el: function () {
            return element;
        }
    }
};

module.exports = HelperCanvas;