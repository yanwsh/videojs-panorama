// @flow

function whichTransitionEvent(){
    let el = document.createElement('div');
    let transitions = {
        'transition':'transitionend',
        'OTransition':'oTransitionEnd',
        'MozTransition':'transitionend',
        'WebkitTransition':'webkitTransitionEnd'
    };

    for(let t in transitions){
        // $FlowFixMe
        if( el.style[t] !== undefined ){
            return transitions[t];
        }
    }
}

export const transitionEvent = whichTransitionEvent();