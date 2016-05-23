/**
 * Created by yanwsh on 4/4/16.
 */

var element = document.createElement('div');
element.className = "vjs-video-notice-label";

var Notice = function(baseComponent){
    return {
        constructor: function init(player, options){
            element.innerHTML = options.NoticeMessage;
            options.el = element;
            baseComponent.call(this, player, options);
        },

        el: function () {
            return element;
        }
    }
};

module.exports = Notice;