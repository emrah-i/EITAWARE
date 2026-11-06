import { describe, expect, it } from 'vitest';
import { galleryFit } from '../src/lib/sticky-gallery';

describe('natural-size gallery viewport fitting', () => {
  it('leaves stacked tablet/mobile galleries in normal flow', () => {
    expect(galleryFit(375, 812, 79, 224, 200)).toBeNull();
    expect(galleryFit(800, 900, 83, 400, 150)).toBeNull();
  });
  it('pins only when the entire naturally sized preview and controls fit', () => {
    expect(galleryFit(1440, 900, 101, 449, 280)).toEqual({ top: 125 });
    expect(galleryFit(1280, 720, 101, 407, 250)).toBeNull();
  });
  it('never compresses square or portrait images to make them sticky', () => {
    expect(galleryFit(1440, 900, 101, 662, 280)).toBeNull();
    expect(galleryFit(1440, 900, 101, 900, 280)).toBeNull();
    expect(galleryFit(1440, 1400, 101, 900, 280)).toEqual({ top: 125 });
  });
  it('includes both navigation gaps at the exact fit boundary', () => {
    expect(galleryFit(1440, 900, 101, 471, 280)).toEqual({ top: 125 });
    expect(galleryFit(1440, 900, 101, 472, 280)).toBeNull();
    expect(galleryFit(1440, 600, 101, 449, 280)).toBeNull();
  });
  it('rechecks fit when selected media, captions, or navigation height change', () => {
    expect(galleryFit(1440, 900, 101, 449, 280)).toEqual({ top: 125 });
    expect(galleryFit(1440, 900, 101, 449, 320)).toBeNull();
    expect(galleryFit(1440, 900, 125, 449, 280)).toBeNull();
    expect(galleryFit(1440, 900, 101, 662, 280)).toBeNull();
  });
});
