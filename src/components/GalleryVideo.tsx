import { createSignal, Show } from 'solid-js';
import type { VideoMedia } from '../shared/catalog';

/** Keep native controls and expose a clearly named keyboard-operable play button. */
export default function GalleryVideo(props: { media: VideoMedia }) {
  const [playing, setPlaying] = createSignal(false);
  const [error, setError] = createSignal(false);
  let video: HTMLVideoElement | undefined;
  async function play() {
    setError(false);
    try { await video?.play(); video?.focus(); } catch { setError(true); }
  }
  return <div class="gallery-video">
    <video ref={video} width={props.media.posterWidth} height={props.media.posterHeight} controls preload="none" poster={props.media.poster} aria-label={`Video: ${props.media.label}`} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}>
      <source src={props.media.src} type="video/mp4" />
      <a href={props.media.src}>Open the product video</a>
    </video>
    <Show when={!playing()}><button class="gallery-play" type="button" aria-label={`Play video: ${props.media.label}`} onClick={play}><span aria-hidden="true">▶</span></button></Show>
    <Show when={error()}><p class="video-error" role="alert">Use the video controls or <a href={props.media.src}>open the video</a> to play.</p></Show>
  </div>;
}
