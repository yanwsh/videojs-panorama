/**
 * Created by yanwsh on 4/4/16.
 */

var element = document.createElement('div');
element.className = "vjs-video-notice-label";
element.innerHTML = "Please use your mouse drag and drop the video.";

var Notice = function(baseComponent){
    return {
        constructor: function init(player, options){
            options.el = element;
            baseComponent.call(this, player, options);
        },

        el: function () {
            return element;
        }
    }
};

module.exports = Notice;