var fs = require('fs');
var spawn = require('child_process').spawn;
var wrench = require('wrench');
var express = require('express');
var app = express();

// makes a temporary directory,
// calls callback(err, dir, done),
// and deletes the directory when you call done()
var makeSandbox = function (callback) {
	var dir = 'sandbox/box-' + Math.random();
	fs.mkdir(dir, function (err) {
		callback(err, dir, function () {
			wrench.rmdirRecursive(dir, function () { });
		});
	});
};

// files: [{ filename: '...', contents: '...' }, ...]
var writeFiles = function (files, dir, callback) {
	var numFilesWritten = 0;
	files.forEach(function (fileInfo) {
		fs.writeFile(dir + '/' + fileInfo.filename, fileInfo.contents, function (err) {
			numFilesWritten++;
			if (numFilesWritten === files.length) {
				callback();
			}
		});
	});
	if (files.length === 0) {
		callback();
	}
};

app.use(express.static(__dirname + '/static'));
app.use(express.bodyParser());

// POST /compile { files: [...] }
// returns {
//     compile: {
//         exitCode: 1,
//         exitSignal: 'SIGHUP',
//         stderr: 'error on line 4 ...',
//         command: 'gcc -Wall -pedantic ...'
//     }
// }
app.post('/compile', function(req, res) {
	var files = req.body.files || [];

	makeSandbox(function (err, dir, done) {
		writeFiles(files, dir, function () {
			var fileNames = files.map(function (f) { return f.filename; });
			var cFiles = fileNames.filter(function (filename) { return /\.c(pp)?$/.test(filename); });

			var args = ['-Wall', '-pedantic', '-ansi'].concat(cFiles);
			var compile = spawn('gcc', args, { cwd: dir });
			var stderr = '';
			compile.stderr.setEncoding('utf8');
			compile.stderr.on('data', function (data) {
				stderr += data;
			});
			compile.on('exit', function (code, signal) {
				res.send({
					compile: {
						exitCode: code,
						exitSignal: signal,
						stderr: stderr,
						command: 'gcc ' + args.join(' ')
					}
				});
				done();
			});
		});
	});
});

// POST /download { files: [...] }
// returns ZIP file with all the files in it
app.post('/download', function(req, res) {
	var files = req.body.files || [];

	makeSandbox(function (err, dir, done) {
		writeFiles(files, dir, function () {
			var fileNames = files.map(function (f) { return f.filename; });
			var cFiles = fileNames.filter(function (filename) { return /\.c(pp)?$/.test(filename); });

			res.contentType('zip');

			var zip = spawn('zip', ['-rj', '-', dir]);
			zip.stdout.on('data', function (data) {
				res.write(data);
			});
			zip.on('exit', function (code) {
				if(code !== 0) {
					res.statusCode = 500;
					console.log('zip process exited with code ' + code);
					res.end();
				} else {
					res.end();
				}
				done();
			});
		});
	});
});

app.listen(3000);
