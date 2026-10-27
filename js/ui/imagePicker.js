(function (LP) {
  'use strict';

  const { el } = LP.dom;

  /** Crop an image file to the centre of a width x height box and shrink it to a JPEG data URL. */
  function imageData(file, width, height) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That file isn’t an image the browser can open.'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const scale = Math.max(width / img.width, height / img.height);
          const sw = width / scale;
          const sh = height / scale;
          canvas.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const SHAPES = {
    portrait: { width: 240, height: 480, className: 'portrait' },   // 1:2, a standing figure
    banner: { width: 480, height: 240, className: 'portrait banner' } // 2:1, a group of figures
  };

  /**
   * Drop an image on it (or click to pick one); a new image replaces the old.
   *   shape      'portrait' (1:2) or 'banner' (2:1)
   *   value      current data URL or null
   *   label      what it is a picture of, for screen readers ("Cultists")
   *   focusKey   data-focus value, so a redraw can restore focus
   *   onChange   (dataUrl | null) => void; the caller stores it and redraws
   */
  function imagePicker(options) {
    const shape = SHAPES[options.shape || 'portrait'];
    const picker = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const use = async (file) => {
      if (!file || !/^image\//.test(file.type)) {
        LP.ui.notify('Drop an image file.', 'error');
        return;
      }
      try {
        options.onChange(await imageData(file, shape.width, shape.height));
      } catch (e) {
        LP.ui.notify(e.message, 'error');
      }
    };
    picker.addEventListener('change', () => use(picker.files[0]));

    const box = el('button', {
      type: 'button', class: shape.className + (options.value ? ' has-image' : ''),
      'aria-label': (options.value ? 'Replace' : 'Add') + ' picture of ' + options.label,
      title: 'Drop an image here, or click to choose one',
      'data-focus': options.focusKey || null,
      onclick: () => picker.click()
    }, options.value ? el('img', { src: options.value, alt: '' }) : el('span', null, options.shape === 'banner' ? 'Drop picture (2:1)' : 'Drop portrait'));
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.classList.add('drag');
    });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      box.classList.remove('drag');
      use(e.dataTransfer.files[0]);
    });

    return el('div', { class: 'portrait-wrap' }, box, picker,
      options.value ? el('button', {
        type: 'button', class: 'btn btn-sm btn-ghost',
        'aria-label': 'Remove picture of ' + options.label,
        onclick: () => options.onChange(null)
      }, 'Remove') : null);
  }

  LP.ui.imageData = imageData;
  LP.ui.imagePicker = imagePicker;
})(window.LP);
