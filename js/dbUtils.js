(function(global) {
    var lib, config;
    var initDB = function(appConfig) {
        if (appConfig) config = appConfig;
        lib = new localStorageDB('browserMonit', localStorage);
        var rows;

        //reset db if it isn't already setup;
        if (!lib.isNew()
            && (
                !lib.tableExists('meta') ||
                !lib.rowCount('meta') ||
                lib.query('meta')[0].version !== config.version
            )
        ) {
            $.notify('A new version of the monitor database is available.');
           $.notify('Upgrading is automatic, and will result in the loss of all monitor logs.');
           $.notify('A download of the data currently stored on your system will start momentarily.');
            exportDB();
            lib.drop();
            return initDB();
        }
        if (lib.isNew()) {
            rows = [ { version: config.version, initializationDate: moment().utc().valueOf(), utcOffset: moment().utcOffset} ];
            lib.createTableWithData('meta', rows);
            rows = config.defaultUrls.map(function(url, ndx) {
                return {url: url.url, label: url.label};
            });
            lib.createTableWithData('urls', rows);
            lib.createTable('pings', [
                'urlID',
                'success',
                'errorMsg',
                'errorThrown',
                'sentTime',
                'completionTime',
                'duration'
            ]);
            lib.commit();
        }
        return lib;
    };

    var dropDB = function() {
        lib.drop();
        initDB();
    };
    
    var exportDB = function() {
        var json = encodeURIComponent(lib.serialize());
        global.location.replace('data:Application/octet-stream;charset=utf-8,' + json);
    };

    global.dbUtil= {
        init: initDB,
        exportDB: exportDB,
        drop: dropDB,
        lib: lib
    }
})(window);
