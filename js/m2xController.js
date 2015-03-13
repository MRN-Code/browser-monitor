(function(global) {
    var Promise = RSVP.Promise;
    var me = {
        client: undefined,
        deviceKey: undefined,
        initialized: false
    };

    var initM2X = function (apiKey, deviceKey) {
        me.client = new M2X(apiKey);
        me.deviceKey = deviceKey;
        me.getDevice = promisifyM2X(me.client.devices.view);
        me.setStreamValue = promisifyM2X(setStreamValue);
        return me.getDevice(me.deviceKey);
    };

    var promisifyM2X = function(fn) {
        var promiseFn = function () {
            var args = Array.prototype.slice.call(arguments);
            return new Promise(function(resolve, reject) {
                args.push(resolve);
                args.push(reject);
                fn.apply(me.client, args);
            });
        };
        return promiseFn;
    };
    var setStreamValue = function(streamName, value, successCB, failureCB) {
        var params = { value: value };
        return me.client.devices.setStreamValue(me.deviceKey, streamName, params, successCB, failureCB);
    };

    me.init = initM2X;

    global.m2xController = me;
})(window);
