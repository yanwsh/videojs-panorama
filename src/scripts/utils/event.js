// @flow

export function customEvent(eventName: string, target: HTMLElement): CustomEvent{
    let event = new CustomEvent(eventName, {
        'detail': {
            target
        }
    });
    return event;
}