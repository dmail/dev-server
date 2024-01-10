// https://github.com/incubated-geek-cc/video-to-GIF/blob/main/js/GIFEncoder.js
// https://github.com/jnordberg/gif.js

import { createNeuQuant } from "./neuquant.js";
import { createLzwEncoder } from "./lzw_encoder.js";

export const createGifEncoder = () => {
  let i = 0;
  const chr = {};
  while (i < 256) {
    chr[i] = String.fromCharCode(i);
    i++;
  }

  const byteArray = [];
  const writeByte = (data) => {
    byteArray.push(data);
  };
  const writeUTFBytes = (string) => {
    let i = 0;
    while (i < string.length) {
      writeByte(string.charCodeAt(i));
      i++;
    }
  };
  const writeBytes = (array, offset = 0, length = array.length) => {
    let i = offset;
    while (i < length) {
      writeByte(array[i]);
      i++;
    }
  };

  let width; // image size
  let height;
  let transparent = null; // transparent color if given
  let transIndex; // transparent index in color table
  let repeat = -1; // no repeat
  let delay = 0; // frame delay (hundredths)
  let started = false; // ready to output frames
  let colorDepth; // number of bit planes
  let usedEntry = []; // active palette entries
  let palSize = 7; // color table size (bits-1)
  let dispose = -1; // disposal code (-1 = use default
  let firstFrame = true;
  let sample = 10; // default sample interval for quantizer
  let comment = "Generated by jsgif (https://github.com/antimatter15/jsgif/)"; // default comment for generated gif

  const writeShort = (pValue) => {
    writeByte(pValue & 0xff);
    writeByte((pValue >> 8) & 0xff);
  };

  const encoder = {
    /**
     * Sets the delay time between each frame, or changes it for subsequent frames
     * (applies to last frame added)
     * int delay time in milliseconds
     * @param ms
     */
    setDelay: (ms) => {
      delay = Math.round(ms / 10);
    },

    /**
     * Sets the GIF frame disposal code for the last added frame and any
     *
     * subsequent frames. Default is 0 if no transparent color has been set,
     * otherwise 2.
     * @param code
     * int disposal code.
     */
    setDispose: (code) => {
      if (code >= 0) dispose = code;
    },

    /**
     * Sets the number of times the set of GIF frames should be played. Default is
     * 1; 0 means play indefinitely. Must be invoked before the first image is
     * added.
     *
     * @param iter
     * int number of iterations.
     * @return
     */
    setRepeat: (iter) => {
      if (iter >= 0) repeat = iter;
    },

    /**
     * Sets the transparent color for the last added frame and any subsequent
     * frames. Since all colors are subject to modification in the quantization
     * process, the color in the final palette for each frame closest to the given
     * color becomes the transparent color for that frame. May be set to null to
     * indicate no transparent color.
     * @param
     * Color to be treated as transparent on display.
     */
    setTransparent: (c) => {
      transparent = c;
    },

    /**
     * Sets the comment for the block comment
     * @param
     * string to be insterted as comment
     */
    setComment: (c) => {
      comment = c;
    },

    /**
     * * Sets frame rate in frames per second. Equivalent to
     * <code>setDelay(1000/fps)</code>.
     * @param fps
     * float frame rate (frames per second)
     */
    setFrameRate: (fps) => {
      if (fps !== 0xf) delay = Math.round(100 / fps);
    },

    /**
     * Sets quality of color quantization (conversion of images to the maximum 256
     * colors allowed by the GIF specification). Lower values (minimum = 1)
     * produce better colors, but slow processing significantly. 10 is the
     * default, and produces good color mapping at reasonable speeds. Values
     * greater than 20 do not yield significant improvements in speed.
     * @param quality
     * int greater than 0.
     * @return
     */
    setQuality: (quality) => {
      if (quality < 1) quality = 1;
      sample = quality;
    },

    /**
     * Sets the GIF frame size. The default size is the size of the first frame
     * added if this method is not invoked.
     * @param w
     * int frame width.
     * @param h
     * int frame width.
     */
    setSize: (w, h) => {
      if (started && !firstFrame) return;
      width = w;
      height = h;
      if (width < 1) width = 320;
      if (height < 1) height = 240;
    },

    setProperties: ({ has_start, is_first }) => {
      started = has_start;
      firstFrame = is_first;
    },

    /**
     * Initiates GIF file creation on the given stream.
     * @param os
     * OutputStream on which GIF images are written.
     * @return false if initial write failed.
     */
    start: () => {
      // reset for subsequent use
      transIndex = 0;
      firstFrame = true;

      try {
        writeUTFBytes("GIF89a"); // header
        started = true;
      } catch (e) {
        started = false;
      }
      return started;
    },

    /**
     * The addFrame method takes an incoming BitmapData object to create each frames
     * @param
     * BitmapData object to be treated as a GIF's frame
     */
    addFrame: (context) => {
      if (!started) {
        throw new Error("Please call start method before calling addFrame");
      }

      const canvas = context.canvas;
      try {
        const imageData = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;

        const pixels = [];
        // build pixels
        {
          var count = 0;
          let y = 0;
          while (y < height) {
            let x = 0;
            while (x < width) {
              const b = y * width * 4 + x * 4;
              pixels[count++] = imageData[b];
              pixels[count++] = imageData[b + 1];
              pixels[count++] = imageData[b + 2];
              x++;
            }
            y++;
          }
        }
        let colorTab;
        let indexedPixels = [];
        // analyze pixels ( build color table & map pixels)
        {
          var len = pixels.length;
          var nPix = len / 3;
          const neuQuant = createNeuQuant(pixels, len, sample);

          // initialize quantizer
          colorTab = neuQuant.process(); // create reduced palette

          // map image pixels to new palette
          var k = 0;
          for (var j = 0; j < nPix; j++) {
            var index = neuQuant.map(
              pixels[k++] & 0xff,
              pixels[k++] & 0xff,
              pixels[k++] & 0xff,
            );
            usedEntry[index] = true;
            indexedPixels[j] = index;
          }

          pixels.length = 0;
          colorDepth = 8;
          palSize = 7;

          // get closest match to transparent color if specified
          if (transparent !== null) {
            /**
             * Returns index of palette color closest to c
             */
            const findClosest = (c) => {
              var r = (c & 0xff0000) >> 16;
              var g = (c & 0x00ff00) >> 8;
              var b = c & 0x0000ff;
              var minpos = 0;
              var dmin = 256 * 256 * 256;
              var len = colorTab.length;

              for (var i = 0; i < len; ) {
                var dr = r - (colorTab[i++] & 0xff);
                var dg = g - (colorTab[i++] & 0xff);
                var db = b - (colorTab[i] & 0xff);
                var d = dr * dr + dg * dg + db * db;
                var index = i / 3;
                if (usedEntry[index] && d < dmin) {
                  dmin = d;
                  minpos = index;
                }
                i++;
              }
              return minpos;
            };
            transIndex = colorTab === null ? -1 : findClosest(transparent);
          }
        }

        /**
         * Writes color table
         */
        const writePalette = () => {
          writeBytes(colorTab);
          var n = 3 * 256 - colorTab.length;
          for (var i = 0; i < n; i++) writeByte(0);
        };

        if (firstFrame) {
          // write logical screen descriptior
          {
            // logical screen size
            writeShort(width);
            writeShort(height);
            // packed fields
            writeByte(
              0x80 | // 1 : global color table flag = 1 (gct used)
                0x70 | // 2-4 : color resolution = 7
                0x00 | // 5 : gct sort flag = 0
                palSize,
            ); // 6-8 : gct size

            writeByte(0); // background color index
            writeByte(0); // pixel aspect ratio - assume 1:1
          }

          // write palette
          writePalette(); // global color table

          // Writes Netscape application extension to define repeat count.
          if (repeat >= 0) {
            writeByte(0x21); // extension introducer
            writeByte(0xff); // app extension label
            writeByte(11); // block size
            writeUTFBytes("NETSCAPE2.0"); // app id + auth code
            writeByte(3); // sub-block size
            writeByte(1); // loop sub-block id
            writeShort(repeat); // loop count (extra iterations, 0=repeat forever)
            writeByte(0); // block terminator
          }
        }

        // write graphic control extension
        {
          writeByte(0x21); // extension introducer
          writeByte(0xf9); // GCE label
          writeByte(4); // data block size
          var transp;
          var disp;
          if (transparent === null) {
            transp = 0;
            disp = 0; // dispose = no action
          } else {
            transp = 1;
            disp = 2; // force clear if using transparent color
          }
          if (dispose >= 0) {
            disp = dispose & 7; // user override
          }
          disp <<= 2;
          // packed fields
          writeByte(
            0 | // 1:3 reserved
              disp | // 4:6 disposal
              0 | // 7 user input - 0 = none
              transp,
          ); // 8 transparency flag

          writeShort(delay); // delay x 1/100 sec
          writeByte(transIndex); // transparent color index
          writeByte(0); // block terminator
        }

        // write comment
        if (comment !== "") {
          writeByte(0x21); // extension introducer
          writeByte(0xfe); // comment label
          writeByte(comment.length); // Block Size (s)
          writeUTFBytes(comment);
          writeByte(0); // block terminator
        }

        // write image descriptor
        {
          writeByte(0x2c); // image separator
          writeShort(0); // image position x,y = 0,0
          writeShort(0);
          writeShort(width); // image size
          writeShort(height);

          // packed fields
          if (firstFrame) {
            // no LCT - GCT is used for first (or only) frame
            writeByte(0);
          } else {
            // specify normal LCT
            writeByte(
              0x80 | // 1 local color table 1=yes
                0 | // 2 interlace - 0=no
                0 | // 3 sorted - 0=no
                0 | // 4-5 reserved
                palSize,
            ); // 6-8 size of color table
          }
        }

        if (!firstFrame) {
          writePalette(); // local color table
        }
        colorTab = null;

        // encode and write pixel data
        {
          const lzwEncoder = createLzwEncoder({
            width,
            height,
            indexedPixels,
            colorDepth,
          });
          lzwEncoder.encode({
            writeByte,
            writeBytes,
          });
        }
        firstFrame = false;
        indexedPixels.length = 0;
        return true;
      } catch (e) {
        return false;
      }
    },

    /**
     * Adds final trailer to the GIF stream, if you don't call the finish method
     * the GIF stream will not be valid.
     */
    finish: () => {
      if (!started) return false;
      started = false;

      try {
        writeByte(0x3b); // gif trailer
        return true;
      } catch (e) {
        return false;
      }
    },

    asBinaryString: () => {
      return byteArray.join("");
    },

    asDataUrl: () => {
      const binaryString = encoder.asBinaryString();
      return `data:image/gif;base64,${encode64(binaryString)}`;
    },
  };

  return encoder;
};

const encode64 = (input) => {
  let output = "";
  let i = 0;
  let l = input.length;
  let key = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let chr1;
  let chr2;
  let chr3;
  let enc1;
  let enc2;
  let enc3;
  let enc4;
  while (i < l) {
    chr1 = input.charCodeAt(i++);
    chr2 = input.charCodeAt(i++);
    chr3 = input.charCodeAt(i++);
    enc1 = chr1 >> 2;
    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    enc4 = chr3 & 63;
    if (isNaN(chr2)) enc3 = enc4 = 64;
    else if (isNaN(chr3)) enc4 = 64;
    output =
      output +
      key.charAt(enc1) +
      key.charAt(enc2) +
      key.charAt(enc3) +
      key.charAt(enc4);
  }
  return output;
};
