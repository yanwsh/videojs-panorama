// @flow

import type { Player} from '../types/index';
import ClickableComponent from './ClickableComponent';

class Button extends ClickableComponent{
    constructor(player: Player, options: any = {}){
        super(player, options);
        this.on("keydown", this.handleKeyPress.bind(this));
    }

    createEl(tagName: string, properties?: any, attributes?: any){
        return super.createEl("button", null, {
            type: "button",
            // let the screen reader user know that the text of the button may change
            'aria-live': 'polite'
        })
    }

    /**
     * Enable the `Button` element so that it can be activated or clicked. Use this with
     * {@link Button#disable}.
     */
    enable() {
        this.el().removeAttribute('disabled');
    }

    /**
     * Enable the `Button` element so that it cannot be activated or clicked. Use this with
     * {@link Button#enable}.
     */
    disable() {
        this.el().setAttribute('disabled', 'disabled');
    }

    handleKeyPress(event: Event){
        // Ignore Space (32) or Enter (13) key operation, which is handled by the browser for a button.
        if (event.which === 32 || event.which === 13) {
            return;
        }
    }
}

export default Button;