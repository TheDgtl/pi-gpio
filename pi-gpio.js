"use strict";
var fs = require("fs"),
	path = require("path"),
	exec = require("child_process").exec;

var gpioAdmin = "gpio-admin",
	sysFsPath = "/sys/devices/virtual/gpio";

var pinMapping = {
	"3": 0,
	"5": 1,
	"7": 4,
	"8": 14,
	"10": 15,
	"11": 17,
	"12": 18,
	"13": 21,
	"15": 22,
	"16": 23,
	"18": 24,
	"19": 10,
	"21": 9,
	"22": 25,
	"23": 11,
	"24": 8,
	"26": 7
};

var rPiRev = "cat /proc/cmdline | awk -v RS=' ' -F= '/boardrev/ { print $2 }'"
exec(rPiRev, function (error, stdout, stderr) {
	if (stdout == "0x02" || stdout == "0x03") { return; }
	var modPinMapping = {
		"3": 2,
		"5": 3,
		"13": 27,
		"30": 28,
		"31": 29,
		"32": 30,
		"33": 31
	};

	for(var pin in modPinMapping) {
		pinMapping[pin] = modPinMapping[pin];
	}
});

function isNumber(number) {
	return !isNaN(parseInt(number, 10));
}

function noop(){}

function handleExecResponse(method, pinNumber, callback) {
	return function(err, stdout, stderr) {
		if(err) {
			console.error("Error when trying to", method, "pin", pinNumber);
			console.error(stderr);
			callback(err);
		} else {
			callback();
		}
	}
}

function sanitizePinNumber(pinNumber) {
	if(!isNumber(pinNumber) || !isNumber(pinMapping[pinNumber])) {
		throw new Error("Pin number isn't valid");
	}

	return parseInt(pinNumber, 10);
}

function sanitizeDirection(direction) {
	direction = (direction || "").toLowerCase().trim();
	if(direction === "in" || direction === "input") {
		return "in";
	} else if(direction === "out" || direction === "output" || !direction) {
		return "out";
	} else {
		throw new Error("Direction must be 'input' or 'output'");
	}
}

function sanitizePull(pull) {
	pull = (pull || "").toLowerCase().trim();
	if (pull === "pullup" || pull === "pulldown") {
		return pull;
	} else {
		return "";
	}
}

function sanitizeOptions(options) {
	if (options && typeof options === "string") {
		var optionTokens = options.split(' ');
		options = {};
		options.direction = optionTokens[0];
		options.pull = optionTokens[1];
	}
	options.direction = sanitizeDirection(options.direction);
	options.pull = sanitizePull(options.pull);
	return options;
}

var gpio = {
	_usedPins: [],
	_listeners: [],

	open: function(pinNumber, options, callback) {
		pinNumber = sanitizePinNumber(pinNumber);

		if (gpio._usedPins.indexOf(pinNumber) == -1) {
			gpio._usedPins.push(pinNumber);
		}

		if(!callback && typeof options === "function") {
			callback = options;
			options = "out";
		}

		options = sanitizeOptions(options);

		exec(gpioAdmin + " export " + pinMapping[pinNumber] + " " + options.pull, handleExecResponse("open", pinNumber, function(err) {
			if(err) return (callback || noop)(err);

			gpio.setDirection(pinNumber, options.direction, callback);
		}));
	},

	setDirection: function(pinNumber, direction, callback) {
		pinNumber = sanitizePinNumber(pinNumber);
		direction = sanitizeDirection(direction);

		fs.writeFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/direction", direction, callback);
	},

	getDirection: function(pinNumber, callback) {
		pinNumber = sanitizePinNumber(pinNumber);

		fs.readFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/direction", "utf8", function(err, direction) {
			if(err) return callback(err);
			callback(null, sanitizeDirection(direction.trim()));
		});
	},

	close: function(pinNumber, callback) {
		pinNumber = sanitizePinNumber(pinNumber);

		var i = gpio._usedPins.indexOf(pinNumber);
		if (i != -1) {
			gpio._usedPins.splice(i, 1);	
		}

		exec(gpioAdmin + " unexport " + pinMapping[pinNumber], handleExecResponse("close", pinNumber, callback || noop));
	},

	read: function(pinNumber, callback) {
		pinNumber = sanitizePinNumber(pinNumber);

		fs.readFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/value", function(err, data) {
			if(err) return (callback || noop)(err);

			(callback || noop)(null, parseInt(data, 10));
		});
	},

	write: function(pinNumber, value, callback) {
		pinNumber = sanitizePinNumber(pinNumber);

		value = !!value?"1":"0";

		fs.writeFile(sysFsPath + "/gpio" + pinMapping[pinNumber] + "/value", value, "utf8", callback);
	},

	cleanup: function(callback) {
        var listeners = gpio._listeners.slice(0);
        for (var i = 0; i < listeners.length; i++) {
            clearInterval(listeners[i]);
        }        

        var usedPins = gpio._usedPins.slice(0);
        for (var i = 0; i < usedPins.length; i++) {
            gpio.close(usedPins[i], callback);
        }
	},
};

process.on('SIGINT', gpio.cleanup);

gpio.export = gpio.open;
gpio.unexport = gpio.close;

module.exports = gpio;
