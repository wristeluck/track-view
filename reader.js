// Uses https://www.npmjs.com/package/binary-format

function create_parser(data) {
    var parser = new jParser(data, {
	all: {
	    catalog: 'catalog',
	    padding: ['array', 'uint8', 512]
	},
	catalog: {
	    first: 'uint32',
	    offsets: ['array', 'uint32', 127]
	},
	nextfive: {
	    records: ['array', 'record', 5]
	},
        next1000: {
            records: ['array', 'record', 1000]
        },
	record: function() {
	    var id = this.parse('uint8');
	    
	    switch (id) {
	    case 0: // SEPARATOR
                var sep = this.parse({separator: 'separator'});
//                console.log(sep);
                if(sep.separator.eyecatcher == 0x5afeca5e)
                    return sep;
                else
                    return null;
	    case 1: // TIMESTAMP
		return this.parse({timestamp: 'timestamp'});
	    case 2: // IMU
		return this.parse({imu: 'imu'});
	    case 3: // PID
		return this.parse({pid: 'pid'});
	    case 4: // PARAM
		return this.parse({param: 'param'});
	    case 5: // GPS
		return this.parse({gps: 'gps'});
	    case 6: // QUATERNION
		return this.parse({quaternion: 'quaternion'});
	    default: // corrupt - trigger recovery
                console.log("corrupt: " + id);
		return null;
	    }
            //					}
	},
	separator: {
	    eyecatcher: 'uint32'
	},
	timestamp: {
	    millis: 'uint32'
	},
	imu: {
	    millis: 'uint32',
	    yaw: 'float32',
	    pitch: 'float32',
	    roll: 'float32'
	},
	pid: {
	    millis: 'uint32',
	    target: 'float32',
	    heading: 'float32',
	    rudder: 'float32'
	},
	param: {
	    millis: 'uint32',
	    kp: 'float32',
	    ki: 'float32',
	    kd: 'float32',
	    deadband: 'uint8'
	},
	timestamp: {
	    millis: 'uint32'
	},
        gps: {
            millis: 'uint32',
            timestamp: function() {
                var str = this.parse('lstring');
                var date = new Date('20'+str.substring(4, 6), str.substring(2, 4) - 1, str.substring(0, 2),
                                    str.substring(6, 8), str.substring(8, 10), str.substring(10, 12), 0);
                return date;
            },
            latitude: 'float32',
            longitude: 'float32',
            speed: function() { return this.parse('uint16') / 10; },
            track: function() { return this.parse('uint16') / 10; }
        },
	quaternion: {
	    millis: 'uint32',
	    w: 'uint16',
	    x: 'uint16',
	    y: 'uint16',
	    z: 'uint16'
	},
        lstring: function() {
            return this.parse(['string', this.parse('uint8')]);
        }
    });

    jParser.prototype.parseBlock = function() {
        var result = [];
        var record;
        var i = 0;
        do {
            record = this.parse('record');
            result.push(record);
        } while(record != null);
        return result;
    }

    return parser;
}

