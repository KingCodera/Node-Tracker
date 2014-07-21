// Native requires.
var fs = require('fs');

// package.json requires.
var mysql = require('mysql');
var _ = require('lodash');

// Local requires.
var Response = require('./../tools/response');
var common = require('./../tools/common');

Database.prototype.flushPeers = function() {
    console.log('Flushing peers');
    this.connection.query('SELECT `id`, `peer_id`, `info_hash`, `left` '
        + 'FROM `nodetracker`.`peers` '
        + 'WHERE `last_update` < DATE_SUB(NOW(), INTERVAL 1 HOUR)'
        , function(err, rows, fields) {
            rows.forEach(function(item) {
                var field = '';
                if (item.left == 0) {
                    field = '`complete`' ;
                } else {
                    field = '`incomplete`';
                }
                this.connection.query('UPDATE `nodetracker`.`torrent` '
                    + 'SET ' + field + ' = ' + field + ' - 1 '
                    + 'WHERE `info_hash` = ' + this.connection.escape(item.info_hash) + ' '
                    + 'AND ' + field + ' > 0'
                    , function(err, result) {
                        console.log('Decremented ' + field + ' on ' + item.info_hash);
                });
                this.connection.query('DELETE FROM `nodetracker`.`peers` '
                    + 'WHERE `id` = ' + this.connection.escape(item.id)
                    , function(err, result) {
                        console.log('Removed peer ' + item.peer_id + ' for torrent: ' + item.info_hash);
                });
            }.bind(this));
    }.bind(this));
};

Database.prototype.checkTorrent = function(peer, callback) {
    this.connection.query('SELECT * FROM `nodetracker`.`torrent` '
        + 'WHERE `info_hash` = ' + this.connection.escape(peer.info_hash)
        , function(err, rows, fields) {
            if (err) {
                callback(err);
            } else if (rows.length == 0) {
                callback(new Error('Torrent not found'));
            } else {
                callback(undefined);
            }
    }.bind(this));
};

Database.prototype.addPeer = function(peer, callback) {
    this.checkTorrent(peer, function(err) {
        if (err) {
            callback(undefined, common.bencodeFailure(200, 'Torrent not in database.'));
        } else  {
            this.transaction(peer, callback);
        }
    }.bind(this));
};

Database.prototype.transaction = function(peer, callback) {
    this.connection.beginTransaction(function(err) {
        this.connection.query('REPLACE '
            + 'INTO `nodetracker`.`peers` (`id`, `peer_id`, `info_hash`, `ip`, `port`, `uploaded`, `downloaded`, `left`) '
            + 'VALUES (' + peer.toAddPeerString() + ')'
            , function(err, result) {
                console.log(result);
                if (err) {
                    this.connection.rollback(function() {
                        callback(err, undefined);
                    });
                } else {
                    // TODO: lol fix that it doesn't update every cycle.
                    var field = '';
                    if (peer._left == 0) {
                        field = '`complete`';
                    } else {
                        field = '`incomplete`';
                    }
                    this.connection.query('UPDATE `nodetracker`.`torrent` '
                        + 'SET ' + field + ' = ' + field + ' + 1 '
                        + 'WHERE `info_hash` = ' + this.connection.escape(peer.info_hash)
                        , function(err, result) {
                            if (err) {
                                this.connection.rollback(function() {
                                    callback(err, undefined);
                                });
                            } else {
                                this.connection.commit(function(err) {
                                    if (err) {
                                        this.connection.rollback(function() {
                                            callback(err, undefined);
                                        })
                                    } else {
                                        this.getPeers(peer.info_hash, peer.numwant, peer._compact, callback);
                                    }
                                }.bind(this));
                            }
                    }.bind(this));
                }
        }.bind(this));
    }.bind(this));
};

Database.prototype.updateStats = function(peer, callback) {

};

Database.prototype.removePeer = function(peer, callback) {
    this.connection.query('SELECT `id`, `peer_id`, `info_hash`, `left` '
        + 'FROM `nodetracker`.`peers` '
        + 'WHERE `id` = ' + this.connection.escape(peer.peer_id + peer.info_hash)
        , function(err, rows, fields) {
            if (err) {
                callback(err);
            } else {
                // TODO: Convert this to a function. (Also used by flushPeers)
                rows.forEach(function(item) {
                    var field = '';
                    if (item.left == 0) {
                        field = '`complete`' ;
                    } else {
                        field = '`incomplete`';
                    }
                    this.connection.query('UPDATE `nodetracker`.`torrent` '
                        + 'SET ' + field + ' = ' + field + ' - 1 '
                        + 'WHERE `info_hash` = ' + this.connection.escape(item.info_hash) + ' '
                        + 'AND ' + field + ' > 0'
                        , function(err, result) {
                            console.log('Decremented ' + field + ' on ' + item.info_hash);
                    });
                    this.connection.query('DELETE FROM `nodetracker`.`peers` '
                        + 'WHERE `peer_id` = ' + this.connection.escape(item.peer_id)
                        , function(err, result) {
                            console.log('Removed peer ' + item.peer_id + ' for torrent: ' + item.info_hash);
                    });
                    callback(undefined);
                }.bind(this));
            }
    }.bind(this));
};

Database.prototype.completePeer = function(peer, callback) {
    this.connection.query('UPDATE `nodetracker`.`torrent` '
        + 'SET `downloaded` = `downloaded` + 1, '
        + '`incomplete` = `incomplete` - 1, '
        + '`complete` = `complete` + 1 '
        + 'WHERE `info_hash` = ' + this.connection.escape(peer.info_hash)
        , function(err, result) {
            if (err) {
                callback(err, undefined);
            } else {
                this.updatePeerComplete(peer, callback);
            }
    }.bind(this));
};

Database.prototype.updatePeer = function(complete, peer, callback) {
    if (complete) {
        this.updatePeerComplete(peer, callback);
    } else {
        this.updatePeerIncomplete(peer, callback);
    }
};

Database.prototype.updatePeerComplete = function(peer, callback) {
    this.connection.query('UPDATE `nodetracker`.`peers` '
        + 'SET `downloaded` = ' + this.connection.escape(peer.downloaded) + ', '
        + '`uploaded` = ' + this.connection.escape(peer.uploaded) + ', '
        + '`left` = ' + this.connection.escape(peer._left) + ' '
        + 'WHERE `id` = ' + this.connection.escape(peer.peer_id + peer.info_hash)
        , function(err, result) {
            if (err) {
                callback(err, undefined);
            } else {
                this.getPeers(peer.info_hash, peer.numwant, peer._compact, callback);
            }
    }.bind(this));
};

Database.prototype.updatePeerIncomplete = function(peer, callback) {
    this.connection.query('SELECT `left` '
        + 'FROM `nodetracker`.`peers` '
        + 'WHERE `peer_id` = ' + this.connection.escape(peer.peer_id) + ' '
        + 'AND `info_hash` = ' + this.connection.escape(peer.info_hash) + ' '
        , function(err, rows, fields) {
            if (err || rows.length != 1) {
                callback(new Error('Cannot update peer'), undefined);
            } else if (rows[0].left > 0 && peer._left == 0) {
                // Torrent completed without 'completed' event.
                this.completePeer(peer, callback);
            } else {
                this.getPeers(peer.info_hash, peer.numwant, peer._compact, callback);
            }
    }.bind(this));
};

Database.prototype.updateOrInsertPeer = function(peer, callback) {
    this.connection.query('INSERT INTO `nodetracker`.`peer` '
        + ''
        , function(err, result) {

    });
}

Database.prototype.getPeers = function(info_hash, numwant, compact, callback) {
    var colums = '`ip`, `port` ';
    if (compact === 0) {
        colums = '`peer_id`, ' + colums;
    }

    console.log('Getting peers for: ' + info_hash);

    this.connection.query('SELECT ' + colums
        + 'FROM `nodetracker`.`peers` '
        + 'WHERE `info_hash` = ' + this.connection.escape(info_hash) + ' '
        + 'ORDER BY RAND() '
        + 'LIMIT ' + this.connection.escape(numwant)
        , function(err, rows, result) {
            if (err) {
                callback(err, undefined);
                return;
            }
            if (rows.length === 0) {
                callback(undefined, Response.encodeFailure(200, 'info_hash not found in database'));
            } else {
                this.scrape(info_hash, function(err, response) {
                    if (err) {
                        callback(err, undefined);
                    } else {
                        rows.forEach(function(item) {
                            response.addPeer(item);
                        });
                        if (compact) {
                            callback(undefined, response.bencodePeersIPv4Compact());
                        } else {
                            callback(undefined, response.bencodePeersIPv4());
                        }
                    }
                }.bind(this));
            }
    }.bind(this));
};

Database.prototype.scrape = function(info_hash, callback) {
    if (Array.isArray(info_hash)) {
        info_hash = _.map(info_hash, function(item) {
            return this.connection.escape(item);
        }.bind(this))
        info_hash = info_hash.join(',');
    } else {
        info_hash = this.connection.escape(info_hash);
    }

    this.connection.query('SELECT `info_hash`, `complete`, `incomplete`, `downloaded` '
        + 'FROM `nodetracker`.`torrent` '
        + 'WHERE `info_hash` IN (' + info_hash + ')'
        , function(err, rows, fields) {
            if (err) {
                callback(err, undefined);
                return;
            }
            var response = new Response();
            rows.forEach(function(item) {
                response.addScrape(item);
            });
            callback(undefined, response);
    });
};

function Database() {
    this.connection = mysql.createConnection({
        host: '192.168.2.29',
        user: 'root',
        password: 'doki'
    });

    this.connection.connect();
    this.flushPeers();
    setInterval(this.flushPeers.bind(this), 1000 * 60 * 4);
}

module.exports = Database;