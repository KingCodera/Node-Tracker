/*
 * Native requires
 */


/*
 * package.json requires
 */
var redis = require('redis');

/*
 * Local requires
 */
var common = require('../tools/common.js');

exports.index = function(req, res) {
    var torrents = 0;
    var peers = 0;
    rc.scard('info_hashes', function(err, reply) {
        if (!err) {
            torrents = reply;
        }
        rc.scard('peers', function(err, reply) {
            if (!err) {
                res.render('index', {title: 'AniDex Tracker', torrents: torrents, peers: peers});
            }
        });
    });
};

exports.announce = function(req, res) {
    console.log(req);
};

exports.scrape = function(req, res) {
    console.log(req);
};