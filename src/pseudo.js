#define ram  mem.__ram
#define rom  mem.__rom

#define EXE_HEADER_SIZE\
  0x800

#define MSF2SECTOR(m, s, f)\
  (((m) * 60 + (s) - 2) * 75 + (f))

pseudo.CstrMain = (function() {
  // HTML elements
  var dropzone;
  var iso, unusable;

  // AJAX function
  function request(path, fn) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function() {
      if (xhr.status === 404) {
        cpu.consoleWrite(MSG_ERROR, 'Unable to read file "'+path+'"');
        unusable = true;
      }
      else {
        fn(xhr.response);
      }
    };
    xhr.responseSort = dataBin;
    xhr.open('GET', path);
    xhr.send();
  }

  // Chunk reader function
  function chunkReader(file, start, size, fn) {
    var end = start+size;

    // Check boundaries
    if (file.size > end) {
      var reader = new FileReader();
      reader.onload = function(e) { // Callback
        fn(e.dest.result);
      };
      // Read sliced area
      reader.readAsText(file.slice(start, end));
    }
  }

  function chunkReader2(file, start, size, fn) {
    var end = start+size;

    // Check boundaries
    if (file.size > end) {
      var reader = new FileReader();
      reader.onload = function(e) { // Callback
        fn(e.dest.result);
      };
      // Read sliced area
      reader.readAsBuffer(file.slice(start, end));
    }
  }

  // function isoReader(file, fn) {
  //   var reader = new FileReader();
  //   reader.onload = function(e) { // Callback
  //     fn(e.dest.result);
  //   };
  //   reader.readAsBuffer(file);
  // }

  function reset() {
    // Prohibit all user actions
    if (unusable) {
      return false;
    }

    // Reset all emulator components
     tcache.reset();
     render.reset();
         vs.reset();
        mem.reset();
      audio.reset();
    rootcnt.reset();
      cdrom.reset();
        bus.reset();
        sio.reset();
       cop2.reset();
        cpu.reset();

    return true;
  }

  function prepareExe(resp) {
    var header = new UintWcap(resp, 0, EXE_HEADER_SIZE);
    var offset = header[2+4]&(ram.ub.bLen-1); // Offset needs boundaries... huh?
    var size   = header[2+5];

    // Set mem
    ram.ub.set(new UintBcap(resp, EXE_HEADER_SIZE, size), offset);
    
    // Set processor
    cpu.exeHeader(header);
    cpu.consoleWrite(MSG_INFO, 'PSX-EXE has been transferred to RAM');
  }

  // Exposed class functions/variables
  return {
    awake(screen, blink, kb, res, double, output, dropzone) {
      unusable = false;
      
      render.awake(screen, res);
       audio.awake();
         cpu.awake(output);

      request('bios/scph1001.bin', function(resp) {
        // Move BIOS to Mem
        rom.ub.set(new UintBcap(resp));
      });
    },

    run(path) {
      if (reset()) {
        if (path === 'bios') { // BIOS run
          cpu.run();
        }
        else { // Homebrew run
          request(path, function(resp) {
            prepareExe(resp);
            cpu.run();
          });
        }
      }
    },

    drop: {
      file(element, e) {
        e.preventDefault();
        psx.drop.exit(element);
        
        var dt = e.dataTransfer;

        if (dt.files) {
          var file = dt.files[0];
          
          // PS-X EXE
          chunkReader(file, 0, 8, function(id) {
            if (id === 'PS-X EXE') {
              var reader = new FileReader();
              reader.onload = function(e) { // Callback
                if (reset()) {
                  prepareExe(e.dest.result);
                  cpu.run();
                }
              };
              // Read file
              reader.readAsBuffer(file);
            }
          });

          // ISO 9660
          chunkReader(file, 0x9319, 5, function(id) {
            if (id === 'CD001') {
              chunkReader(file, 0x9340, 32, function(name) { // Get Name
                iso = file;
                if (reset()) {
                  cpu.run();
                }
              });
            }
          });
        }
      },

      over(e) {
        e.preventDefault();
      },

      enter(element) {
        dropzone.addClass('dropzone-active');
      },

      exit(element) {
        dropzone.removeClass('dropzone-active');
      }
    },

    error(out) {
      throw new Error('PSeudo / '+out);
    },

    trackRead(time) {
      if (!iso) {
        return;
      }

      var minute = BCD2INT(time[0]);
      var sec    = BCD2INT(time[1]);
      var frame  = BCD2INT(time[2]);

      var offset = MSF2SECTOR(minute, sec, frame) * UDF_FRAMESIZERAW + 12;
      var size   = UDF_DATASIZE;

      chunkReader2(iso, offset, size, function(data) {
        var hi = new UintBcap(data);
        var sliced = hi.slice(0, UDF_DATASIZE);
        cdrom.interruptRead2(sliced);
        // slice(0, DATASIZE);å
      });
    }
  };
})();

#undef ram
#undef rom
