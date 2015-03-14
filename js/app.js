(function() {
var utcOffset = moment().utcOffset();
var Promise = RSVP.Promise;
var allStop = true;
var $table = $('[data-hook=summaryTable]');
var m2x = m2xController;
var db;
var config = {
    version: '1.0.1',
    defaultUrls: [
        { url: 'https://chronus.mrn.org/ajaxping.html', label: 'Chronus' },
        { url: 'https://portal.mrn.org/ajaxping.html', label: 'Portal' },
        { url: 'http://coinsping.azurewebsites.net?callback=_jqjsp', label: 'Azure' }
    ],
    logDuration: 12 * 60 * 60 * 1000 // 12 hours
};

// Time methods
var nowUTC = function() {
    return moment().utc().valueOf();
};

var utcToLocal = function(date) {
    return moment(date).utcOffset(utcOffset);
};


// UI methods
var printSummaryTableRow = function(url) {
    var tableCols = [
        'ID',
        'label',
        'count',
        'successRate',
        'avgSuccessResponseTime',
        'avgFailureResponseTime',
        'avgResponseTime'
    ];
    var $tmpRow = $('<tr>');
    var $row = $table.find('[data-url-id=' + url.ID + ']');
    $tmpRow.attr('data-url-id', url.ID);
    var stats = getURLStatistics(url);
    tableCols.forEach(function (key) {
        var $col = $('<td>');
        $col.html(stats[key]).appendTo($tmpRow);
    });
    if(!$row.length) {
        $tmpRow.appendTo($table.find('tbody'));
    } else {
        $row.replaceWith($tmpRow);
    };
};


var getURLStatistics = function(url) {
    var stats = {
        ID: url.ID,
        label: url.label,
        count: 0,
        successRate: 0,
        avgSuccessResponseTime: 0,
        avgFailureResponseTime: 0,
        avgResponseTime: 0
    }
    var rows = db.queryAll("pings", { query: {urlID: url.ID} });
    var computeAvg = function(currentAvg, count, nextVal) {
        var weighted = currentAvg * count;
        return (weighted + nextVal) / (count + 1);
    };
    var computeStats = function(stats, row, ndx) {
        var success = row.success ? 1 : 0;
        var responseTime
        stats.successRate = computeAvg(
            (stats.successRate / 100),
            stats.count,
        success) * 100;
        if( success ) {
            stats.avgSuccessResponseTime = computeAvg(
                stats.avgSuccessResponseTime,
                stats.count,
                row.duration
            );
        } else {
            stats.avgFailureResponseTime = computeAvg(
                stats.avgFailureResponseTime,
                stats.count,
                row.duration
            );
        }
        stats.avgResponseTime = computeAvg(
            stats.avgResponseTime,
            stats.count,
            row.duration
        );
        stats.count ++;
        return stats;
    };
    rows.reduce(computeStats,  stats);
    return stats;
};


// Ping methods
var ping = function(url) {
    return new Promise (function promisifyJSONp(resolve, reject) {
        $.jsonp({
            url: url,
            timeout: config.timeout,
            success: function( data, textStatus, jqXHR ) {
                resolve({
                    data: data,
                    textStatus: textStatus,
                    jqXHR: jqXHR
                });
            },
            error: function( jqXHR, textStatus, errorThrown ) {
                reject({
                    jqXHR: jqXHR,
                    textStatus: textStatus,
                    errorThrown: errorThrown
                }); 
            }
        });
    });
};


var pingAndLog = function(url) {
    var startTime;
    var logPingSuccess = function( data, textStatus, jqXHR ) {
        var completionTime = nowUTC();
        var duration = completionTime - startTime;
        var streamName = url.label + 'ResponseTime';
        var result = {
            urlID: url.ID,
            success: true,
            errorMsg: null,
            errorThrown: null,
            sentTime: startTime,
            completionTime: completionTime,
            duration: duration
        }
        db.insert('pings', result);
        db.commit();
        m2xController.setStreamValue(streamName, duration);
    };
    var logPingFailure = function( jqXHR, textStatus, errorThrown ) {
        var completionTime = nowUTC();
        var duration = completionTime - startTime;
        var streamName = url.label + 'ResponseTime';
        var result = {
            urlID: url.ID,
            success: false,
            errorMsg: null,
            errorThrown: null,
            sentTime: startTime,
            completionTime: completionTime,
            duration: duration
        }
        db.insert('pings', result);
        db.commit();
        m2xController.setStreamValue(streamName, (0 - duration));
    };
    startTime = nowUTC();
    return ping(url.url)
        .then(logPingSuccess, logPingFailure);
};

var pingForever = function() {
    allStop = false;
    var urls = db.query('urls');
    var callPingAndLog = function(i) {
        pingAndLog(urls[i]).then(function() {
            var url = urls[i];
            i++;
            if (i >= urls.length) {
                i = 0;
                cleanPings();
            } 
            if (!allStop) {
                setTimeout(function(){ callPingAndLog(i); }, 60000);
            }
            printSummaryTableRow(url);
        });
    };
    callPingAndLog(0);
};

var cleanPings = function() {
    var now = nowUTC();
    var deleteBefore = now - config.logDuration;
    var rows = db.deleteRows('pings', function(row) {
        return row.sentTime < deleteBefore;
    });
    updateLogStartTime();
};

var updateLogStartTime = function() {
    var firstPing = db.query('pings', {
        limit: 1,
        sort: ['sentTime', 'ASC']
    })[0];
    var localMoment =  utcToLocal(firstPing.sentTime);
    $('[data-hook=logStartTime]').html(localMoment.format('LLL'));
}


// Initialization methods
var init = function() {
    db = dbUtil.init(config);
    initTable();
    pingForever();
};


var initUI = function() {
    var $dropBtn = $('[data-hook=dropButton]');
    var $loginBtn= $('[data-hook=loginButton]');
    var $exportBtn= $('[data-hook=exportButton]');
    $dropBtn.on('click', dbUtil.drop);
    $loginBtn.on('click', initM2X);
    $exportBtn.on('click', dbUtil.exportDB);
};


var initTable = function() {
    var urls = db.query('urls');
    cleanPings();
    urls.forEach(function(url) {
        printSummaryTableRow(url);
    });
};


var initM2X = function() {
    var apiKey = $('#m2x_api_key').val();
    var deviceId = $('#m2x_device_id').val();

    m2xController.init(apiKey, deviceId)
        .then(function(data) {
            $('#login').hide();
            $('#dashboard').show();
            $('#m2x_device_name').html('Logging data to ' + data.name);
            init();
        })
        .catch(function(err) {
            var error = err.message || JSON.stringify(err);
            $.notify('There was an error validating your credentials: ' + error);
        });
}


initUI();
})();
