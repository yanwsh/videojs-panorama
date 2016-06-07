/**
 * Created by yanwsh on 6/6/16.
 */
var MobileBuffering = {
    prev_currentTime: 0,
    counter: 0,
    
    isBuffering: function (currentTime) {
        if (currentTime == this.prev_currentTime) this.counter++;
        else this.counter = 0;
        this.prev_currentTime = currentTime;
        if(this.counter > 10){
            //not let counter overflow
            this.counter = 10;
            return true;
        }
        return false;
    }
};

module.exports = MobileBuffering;