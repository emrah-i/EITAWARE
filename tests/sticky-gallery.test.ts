import { describe, expect, it } from 'vitest';
import { galleryFit } from '../src/lib/sticky-gallery';

describe('gallery viewport fitting', () => {
  it('leaves stacked tablet/mobile galleries in normal flow', () => {
    expect(galleryFit(375, 812, 79, 331, 200)).toBeNull();
    expect(galleryFit(800, 900, 83, 752, 150)).toBeNull();
  });
  it('reserves space for navigation, thumbnails, captions, and both gaps', () => {
    expect(galleryFit(1440, 900, 101, 662, 280)).toEqual({ top: 125, height: 471 });
    expect(galleryFit(1280, 720, 101, 600, 250)).toEqual({ top: 125, height: 321 });
  });
  it('does not enlarge natural media in tall viewports', () => {
    const fit = galleryFit(1440, 1400, 101, 540, 250)!;
    expect(fit.top).toBe(125);
    expect(fit.height).toBeLessThanOrEqual(500);
    expect(fit.height).toBeGreaterThanOrEqual(499);
  });
  it('falls back to natural scrolling in short windows without clipping controls', () => {
    expect(galleryFit(1440, 600, 101, 662, 280)).toBeNull();
    expect(galleryFit(1440, 669, 101, 662, 280)).toEqual({ top: 125, height: 240 });
    expect(galleryFit(1440, 668, 101, 662, 280)).toBeNull();
  });
  it('refits when video captions or header height change', () => {
    const image = galleryFit(1440, 900, 101, 662, 280)!;
    const video = galleryFit(1440, 900, 101, 662, 320)!;
    const tallerHeader = galleryFit(1440, 900, 121, 662, 280)!;
    expect(image.height - video.height).toBe(40);
    expect(tallerHeader.top - image.top).toBe(20);
    expect(image.height - tallerHeader.height).toBe(20);
  });
});
