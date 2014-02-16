State = (function () {
    "use strict";

    var history = [];
    var cursorPos = -1;


    return {
        back: function State_back() {
            if (cursorPos - 1 < 0 || !history[cursorPos - 1])
                throw new Error("Wrong state");

            // move cursor & dispatch action
            cursorPos -= 1;
            var newState = history[cursorPos];

            var params = copyObj(newState.params);
            params.forward = true;
            params.back = (cursorPos > 0);

            Actions[newState.action](params);
        },

        forward: function State_forward() {
            if (!history[cursorPos + 1])
                throw new Error("Wrong state");

            // move cursor & dispatch action
            cursorPos += 1;
            var newState = history[cursorPos];

            var params = copyObj(newState.params);
            params.back = true;
            params.forward = (cursorPos < history.length - 1);

            Actions[newState.action](params);
        },

        dispatch: function State_dispatch(action, params) {
            params = params || {};

            // update app state
            history.length = cursorPos + 1;
            history.push({action: action, params: params});
            cursorPos += 1;

            params = copyObj(params);
            params.back = (cursorPos > 0);
            params.forward = (cursorPos < history.length - 1);

            // dispatch action
            Actions[action].call(this, params);
        },

        home: function State_home() {
            history.length = 0;
            cursorPos = -1;

            this.dispatch("index");
        }
    };
})();
