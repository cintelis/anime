import {
  expect,
} from '../utils.js';

import {
  createTimeline,
  stagger,
  utils,
} from '../../dist/modules/index.js';

// Adds `count` empty .lazy-item elements to the test container and returns them
const createItems = (count = 3) => {
  const $container = document.querySelector('#tests');
  const items = [];
  for (let i = 0; i < count; i++) {
    const $el = document.createElement('div');
    $el.className = 'lazy-item';
    $container.appendChild($el);
    items.push($el);
  }
  return items;
};

const x = $el => utils.get($el, 'x', false);

suite('Timeline lazy targets', () => {

  test('A selector string only finds elements that exist when .add() is called', async () => {
    const tl = createTimeline()
      .call(() => createItems())
      .add('.lazy-item', { x: 100, duration: 30 });
    await tl.then(() => {});
    utils.$('.lazy-item').forEach($el => expect(x($el)).to.equal(0));
  });

  test('A targets function finds elements created earlier in the timeline', async () => {
    const tl = createTimeline()
      .call(() => createItems())
      .add(() => '.lazy-item', { x: 100, duration: 30 });
    await tl.then(() => {});
    const items = utils.$('.lazy-item');
    expect(items.length).to.equal(3);
    items.forEach($el => expect(x($el)).to.equal(100));
  });

  test('The targets function receives the timeline and can return elements', async () => {
    let received = null;
    const tl = createTimeline()
      .call(() => createItems(2))
      .add(timeline => { received = timeline; return document.querySelectorAll('.lazy-item'); }, { x: 50, duration: 30 });
    await tl.then(() => {});
    expect(received).to.equal(tl);
    utils.$('.lazy-item').forEach($el => expect(x($el)).to.equal(50));
  });

  test('Reserves delay + duration so later steps are positioned correctly', () => {
    const tl = createTimeline({ autoplay: false })
      .add(() => '.lazy-item', { x: 10, delay: 100, duration: 200 })
      .label('AFTER')
      .add('#target-id', { y: 10, duration: 100 });
    expect(tl.labels.AFTER).to.equal(300);
    expect(tl.duration).to.equal(400);
  });

  test('Timeline defaults apply to lazy steps', () => {
    const tl = createTimeline({ autoplay: false, defaults: { duration: 120 } })
      .add(() => '.lazy-item', { x: 10 });
    expect(tl.duration).to.equal(120);
  });

  test('Stays in sync when the timeline is seeked forwards and backwards', () => {
    const [$el] = createItems(1);
    const tl = createTimeline({ autoplay: false })
      .add(() => '.lazy-item', { x: 100, duration: 200, ease: 'linear' });
    tl.seek(200);
    expect(x($el)).to.equal(100);
    tl.seek(100);
    expect(x($el)).to.be.closeTo(50, .5);
    tl.seek(0);
    expect(x($el)).to.equal(0);
  });

  test('Numeric delays are honoured', () => {
    const [$el] = createItems(1);
    const tl = createTimeline({ autoplay: false })
      .add(() => '.lazy-item', { x: 100, delay: 100, duration: 100, ease: 'linear' });
    tl.seek(50);
    expect(x($el)).to.equal(0);
    tl.seek(150);
    expect(x($el)).to.be.closeTo(50, .5);
    tl.seek(200);
    expect(x($el)).to.equal(100);
  });

  test('Stagger delays are time-scaled to fit the reserved slot', () => {
    const items = createItems(3);
    const tl = createTimeline({ autoplay: false })
      .add(() => '.lazy-item', { x: 100, delay: stagger(100), duration: 300, ease: 'linear' });
    expect(tl.duration).to.equal(300);
    tl.seek(150);
    // First item starts earlier than the last, so it's further along
    expect(x(items[0])).to.be.above(x(items[2]));
    tl.seek(300);
    items.forEach($el => expect(x($el)).to.equal(100));
  });

  test('Animation callbacks fire', async () => {
    let begins = 0;
    let completes = 0;
    const tl = createTimeline()
      .call(() => createItems(2))
      .add(() => '.lazy-item', {
        x: 100,
        duration: 30,
        onBegin: () => begins++,
        onComplete: () => completes++,
      });
    await tl.then(() => {});
    expect(begins).to.equal(1);
    expect(completes).to.equal(1);
  });

  test('revert() restores lazily animated elements', async () => {
    const tl = createTimeline()
      .call(() => createItems(2))
      .add(() => '.lazy-item', { x: 100, duration: 30 });
    await tl.then(() => {});
    tl.revert();
    utils.$('.lazy-item').forEach($el => expect($el.style.transform).to.equal(''));
  });

  test('Stagger positions are not supported and fall back with a warning', () => {
    const warn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
      const tl = createTimeline({ autoplay: false })
        .add(() => '.lazy-item', { x: 10, duration: 100 }, stagger(50));
      expect(warned).to.equal(true);
      expect(tl.duration).to.equal(100);
    } finally {
      console.warn = warn;
    }
  });

});
