export const bitmaps = [
  'awake', 'down1', 'down2', 'dtogi1',
  'dtogi2', 'dwleft1', 'dwleft2', 'dwright1',
  'dwright2', 'jare2', 'kaki1', 'kaki2', 'left1',
  'left2', 'ltogi1', 'ltogi2', 'mati2', 'mati3',
  'right1', 'right2', 'rtogi1', 'rtogi2', 'sleep1',
  'sleep2', 'up1', 'up2', 'upleft1', 'upleft2',
  'upright1', 'upright2', 'utogi1', 'utogi2'
];

export function load() {
  let imgs = {};
  let promises = bitmaps.map((n) => {
    return new Promise((resolve, reject) => {
      let img = document.createElement('img');
      img.onload = () => {
        resolve(img);
      };
      img.onerror = () => {
        reject(n);
      };

      let w = window.location;

      let location = `${w.origin}${w.pathname}neko/${n}.png`;
      img.src = location;
    });
  });

  return Promise.all(promises).then((array) => {
    let result = {};
    for (let i = 0; i < bitmaps.length; i++) {
      result[bitmaps[i]] = array[i];
    }
    return result;
  })
}
    
  
