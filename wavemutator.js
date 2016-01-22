(function() {
  'use strict';
  var webaudio, // the webaudio context
    audio,      // audio source node used for playback
    volume,     // volume node
    mutations,  // object containing all available functions for buffer modification
    mutating;   // stores the ID of the interval of the mutation call, when one is defined

  /**
   * create an audio buffer
   * @param   freq the frequency the sound to generate. approximation only!
   * @param   type 'saw', 'square', 'noise' or 'sine', defaults to 'sine'
   * @returns a new AudioBuffer containing one swing of the wave
   */
  function audioBuffer(freq, type) {
    var length = webaudio.sampleRate / freq, // number of samples matches one period
      buffer = webaudio.createBuffer(1, length, webaudio.sampleRate),
      data   = buffer.getChannelData(0),
      i;

    switch (type) {
      case 'saw':
        for (i = 0; i < length; i++) data[i] = 1 - (2 * i / length);
        break;
      case 'square':
        for (i = 0; i < length; i++) {
          if (i < length / 2) data[i] = 1;
          else data[i] = -1;
        }
        break;
      case 'noise':
        // use a a frequency 32 times lower for a decent buffer length
        buffer = webaudio.createBuffer(1, 32 * length, webaudio.sampleRate);
        data = buffer.getChannelData(0);
        for (i = 0; i < 32 * length; i++) data[i] = Math.random() * 2 - 1;
        break;
      default: // sine
        var period = 2 * Math.PI / length;
        for (i = 0; i < length; i++) data[i] = Math.sin(period * i);
    }
    return buffer;
  }

  /**
   * create/replace the audio source using a given buffer & start playing it
   * @param buffer the buffer to use
   */
  function newBufferSource(buffer) {
    var newAudio = webaudio.createBufferSource();
    newAudio.loop = true;
    newAudio.connect(volume);
    newAudio.buffer = buffer;
    newAudio.start(0);
    if (audio) audio.stop();
    audio = newAudio;
  }

  /**
   * visualize an array of samples on a canvas
   * @param   samples an Float32Array of samples in the range -1 to 1
   * @param   canvas  the canvas element to draw to
   */
  function drawBuffer(samples, canvas) {
    var x, y, i, n = samples.length,
      width  = canvas.width,
      height = canvas.height,
      ctx    = canvas.getContext('2d');

    ctx.strokeStyle = '#0F0';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    for (i = 0; i < n; i++) {
      x = (i * width) / n;
      y = height / 2 - samples[i] * height / 2;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.closePath();

    // display frequency in bottom left
    ctx.fillStyle = '#0F0';
    ctx.font = '16px asdf';
    ctx.fillText((webaudio.sampleRate / n).toFixed(1) + ' Hz', 10, height - 10);
  }

  /**
   * recreates the buffer source node with the current settings from the UI
   */
  function updateBuffer() {
    newBufferSource( audioBuffer($('#freq').val(), $('#wavetype').val()) );

    // draw the new buffer to canvas
    drawBuffer(audio.buffer.getChannelData(0), $('#sampleviewer')[0]);
  }

  /**
   * helper function to fit a 'value' in the interval ['min', 'max']
   */
  function fitRange(value, min, max) {
    var result = value;
    if      (value < min) result = min;
    else if (value > max) result = max;
    return result;
  }

  /**
   * namespace for all mutation functions, which mudify the buffer
   */
  mutations = {
    /* will result in a sine wave */
    sinify: function(buffer, amount) {
      var period = 2 * Math.PI / buffer.length;
      for (var i = 0; i < buffer.length; i++) {
        var value = buffer[i];
        value += Math.sin(period * i) * 0.01 * amount;
        buffer[i] = fitRange(value, -1, 1);
      }
    },
    /* will result in a square wave */
    squarify: function(buffer, amount) {
      for (var i = 0; i < buffer.length; i++) {
        var value = buffer[i];
        if (i < buffer.length / 2) value += 0.01 * amount;
        else value -= 0.01 * amount;
        buffer[i] = fitRange(value, -1, 1);
      }
    },
    /* will result in a single impulse */
    peakify: function(buffer, amount) {
      for (var i = 0; i < buffer.length; i++) {
        var value = buffer[i] - i * 0.0001 * amount;
        buffer[i] = fitRange(value, -1, 1);
      }
    },
    /* will result in a nothing wave */
    nullify: function(buffer, amount) {
      for (var i = 0; i < buffer.length; i++) {
        var value = buffer[i];
        if (value > 0) value -= 0.01 * amount;
        else if (value < 0) value += 0.01 * amount;
        buffer[i] = fitRange(value, -1, 1);
      }
    },
    /* will shift the wave up/down */
    offsettify: function(buffer, amount) {
      for (var i = 0; i < buffer.length; i++) {
        var value = buffer[i] += 0.01 * amount;
        buffer[i] = fitRange(value, -1, 1);
      }
    },
    /* will result in a smoothed wave */
    smoothify: function(buffer) {
      for (var i = 0; i < buffer.length; i++) {
          var value = buffer[i],
            prev  = buffer[(buffer.length + i - 1) % buffer.length],
            next  = buffer[(i + 1) % buffer.length];
          buffer[i] = (prev + value + next) / 3;
      }
    },
    /* will add ugly overtones wave */
    noisify: function(buffer, amount) {
      for (var i = 0; i < buffer.length; i++) {
        var value = buffer[i] + (Math.random() * 0.02 * amount) - 0.01 * amount;
        buffer[i] = fitRange(value, -1, 1);
      }
    },
    /* will result in white noise */
    randomizify: function(buffer) {
      for (var i = 0; i < buffer.length; i++) {
        buffer[i] = Math.random() * 2 - 1;
      }
    },
  }

  /**
   * modifies the buffer according to one of the selected methods in the UI
   */
  function mutateBuffer() {
    var data = audio.buffer.getChannelData(0),
      newBuffer = webaudio.createBuffer(1, data.length, webaudio.sampleRate),
      amount = $('#mutation-amount').val() - 20; // slider has range 0-40

    // run the UI-selected mutation on the buffer
    mutations[$('#mutation').val()](data, amount);

    // we need to create a new buffer source, as the buffer becomes immutable
    // after setting it. oooh, the irony..
    newBuffer.copyToChannel(data, 0, 0);
    newBufferSource(newBuffer);

    drawBuffer(data, $('#sampleviewer')[0]);
  }

  /* UI click handlers */
  $('#play').click(function() {
    if (webaudio.state === 'suspended') {
      webaudio.resume();
      $(this).text('PAUSE');
    } else {
      webaudio.suspend();
      $(this).text('PLAY');
    }
  });
  $('#wavetype').change(updateBuffer);
  $('#freq').change(updateBuffer);
  $('#volume').change(function() { volume.gain.value = $(this).val(); });
  $('#mutate').click(function() {
    if (mutating) {
      clearInterval(mutating);
      mutating = undefined;
      $(this).text('START');
    } else {
      mutateBuffer();
      mutating = window.setInterval(mutateBuffer, 200);
      $(this).text('STOP');
    }
  });
  $('#export').click(function() {
    // convert the current buffer to wav & open it in a new tab
    // utilizing https://github.com/Jam3/audiobuffer-to-wav/
    var wav = audioBufferToWav(audio.buffer);
    var wavAsBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(wav)));
    window.open('data:audio/wav;base64,' + encodeURIComponent(wavAsBase64));
  });

  /* INIT */
  $(document).ready(function() {
    webaudio = new (window.AudioContext || window.webkitAudioContext)();
    if (webaudio === 'undefined') return $('#msg').text('Web Audio unsupported!');

    volume = webaudio.createGain();
    volume.gain.value = $('#volume').val();
    volume.connect(webaudio.destination);

    // create buffer with values from UI
    newBufferSource( audioBuffer($('#freq').val(), $('#wavetype').val()) );

    // draw the current buffer to the canvas
    drawBuffer(audio.buffer.getChannelData(0), $('#sampleviewer')[0]);

    // don't play anything at startup. doesnt work on firefox? :o
    webaudio.suspend();
  });
})();
