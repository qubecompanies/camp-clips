import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/landing.css';

export default function Landing() {
  // The editor locks html/body to height:100% + overflow:hidden. The landing
  // needs normal document scrolling, so flag the route on <html> while mounted.
  useEffect(() => {
    document.documentElement.classList.add('cc-landing-mode');
    return () => document.documentElement.classList.remove('cc-landing-mode');
  }, []);

  return (
    <div className="cc-landing">
      {/* Reusable aperture marks */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <symbol id="apertureBare" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M32 8 A24 24 0 0 0 8 32 L20 32 A12 12 0 0 1 32 20 Z" fill="#F59E0B" />
            <path d="M8 32 A24 24 0 0 0 32 56 L32 44 A12 12 0 0 1 20 32 Z" fill="#4338CA" />
            <path d="M32 56 A24 24 0 0 0 56 32 L44 32 A12 12 0 0 1 32 44 Z" fill="currentColor" />
            <circle cx="32" cy="32" r="6" fill="#FFFFFF" />
          </symbol>
        </defs>
      </svg>

      {/* NAV */}
      <nav>
        <div className="nav-inner">
          <Link to="/app" className="nav-brand">
            <div className="nav-mark" style={{ color: 'var(--ink)' }}>
              <svg viewBox="0 0 64 64">
                <use href="#apertureBare" />
              </svg>
            </div>
            <span className="name">Camp Clips</span>
          </Link>
          <div className="nav-spacer" />
          <a href="#features" className="nav-link">
            Features
          </a>
          <a href="#how" className="nav-link">
            How it works
          </a>
          <Link to="/app" className="btn btn-primary">
            Open the app
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-inner">
          <div>
            <div className="hero-eyebrow">Slideshows · Made Simple</div>
            <h1>
              The week, <em>in one watchable show</em>.
            </h1>
            <p className="lede">
              For Stake camps, ward events, family reunions, and every other time you have a thousand photos and ten
              minutes to make something that won't embarrass you on the projector.
            </p>
            <div className="hero-cta">
              <Link to="/app" className="btn btn-primary btn-large">
                Open Camp Clips →
              </Link>
              <a href="#how" className="btn btn-ghost btn-large">
                See how it works
              </a>
            </div>
            <div className="hero-meta">
              <span>Free to use</span>
              <span>Nothing uploads</span>
              <span>Works on iPhone</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="app-preview">
              <div className="app-header">
                <div className="preview-mark" style={{ color: '#FCE7B5' }}>
                  <svg viewBox="0 0 64 64" style={{ width: '100%', height: '100%' }}>
                    <use href="#apertureBare" />
                  </svg>
                </div>
                <div className="preview-title">Camp Clips</div>
                <div className="preview-actions">
                  <div className="preview-btn" style={{ background: 'var(--secondary)', color: '#FFFFFF' }}>
                    Export
                  </div>
                  <div className="preview-btn" style={{ background: 'var(--primary)', color: '#14181F' }}>
                    ▶ Play
                  </div>
                </div>
              </div>
              <div className="app-body">
                <div className="preview-event">Sugar Hill Stake Youth Camp</div>
                <div className="preview-loc">Aiken, SC · June 2026 · 247 photos</div>
                <div className="preview-grid">
                  <div className="preview-tile" />
                  <div className="preview-tile" />
                  <div className="preview-tile" />
                  <div className="preview-tile" />
                  <div className="preview-tile" />
                  <div className="preview-tile" />
                  <div className="preview-tile" />
                  <div className="preview-tile" />
                </div>
                <div className="preview-progress">
                  <div className="preview-progress-fill" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="trust">
        <p>
          Built for Stake comms · ward leaders · family event planners · anyone who's ever been handed a SD card the
          night before the slideshow is due.
        </p>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="section-head">
          <div className="section-eyebrow">Built for the night before</div>
          <h2>
            Drop photos in, <em>get a slideshow out</em>.
          </h2>
          <p>
            No timeline. No keyframes. No subscription. Pick what you've got, set how long the show should be, and Camp
            Clips builds the rest.
          </p>
        </div>

        <div className="feature-grid">
          <div className="feature">
            <div className="ftnum">01</div>
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <h3>Drop a folder of photos.</h3>
            <p>
              Drag in 50 or 500 — Camp Clips downscales and orders them automatically. HEIC from iPhone, JPG from a
              Canon, mixed batches all work. Drop them once.
            </p>
          </div>

          <div className="feature">
            <div className="ftnum">02</div>
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <h3>Add a few songs.</h3>
            <p>
              Pick MP3s from your phone or laptop. Music plays through as the slideshow runs — loops if it's shorter,
              fades if it's longer. Match the show length to the music with one click.
            </p>
          </div>

          <div className="feature">
            <div className="ftnum">03</div>
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <h3>Hit play. Or export.</h3>
            <p>
              Full-screen playback runs on the projector tonight. Export to MP4 to share later. Cinematic zoom-and-pan
              motion on every photo, automatically — no editing skills required.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how" id="how">
        <div className="section-head">
          <div className="section-eyebrow">How it works</div>
          <h2>
            From SD card to projector <em>in fifteen minutes</em>.
          </h2>
          <p>
            Built for the realistic workflow — the one where photos arrived ten minutes ago and the show starts in
            twenty.
          </p>
        </div>

        <div className="steps">
          <div className="step">
            <div className="step-num">i.</div>
            <h4>Open the app.</h4>
            <p>campclips.qubecompanies.com loads in any browser. Nothing to install.</p>
          </div>
          <div className="step">
            <div className="step-num">ii.</div>
            <h4>Drop photos &amp; songs.</h4>
            <p>From your phone, your laptop, or a folder you synced from Google Drive.</p>
          </div>
          <div className="step">
            <div className="step-num">iii.</div>
            <h4>Pick how long.</h4>
            <p>Time limit, match-the-music, or every photo. Shuffle is one tap.</p>
          </div>
          <div className="step">
            <div className="step-num">iv.</div>
            <h4>Play or export.</h4>
            <p>Full-screen on the projector, or render to MP4 and share later.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="cta-inner">
          <h2>
            It's <em>free</em>, and it's ready.
          </h2>
          <p>Built by Qube Companies — no subscription, no upload, no watermark. Just open the link.</p>
          <Link to="/app" className="btn btn-primary btn-large">
            Open Camp Clips →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-mark" style={{ color: '#FCE7B5' }}>
              <svg viewBox="0 0 64 64">
                <use href="#apertureBare" />
              </svg>
            </div>
            <h4>Camp Clips</h4>
            <div className="tagline">Slideshows · Made Simple</div>
            <p>
              A Qube Companies product. Built for Stake camps, ward events, and family reunions — by a guy who's been
              stuck doing the slideshow the night before, too.
            </p>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <Link to="/app">Open the app</Link>
          </div>
          <div className="footer-col">
            <h5>Qube</h5>
            <a href="https://qubecompanies.com">Qube Companies</a>
            <a href="#">Contact</a>
            <a href="#">Privacy</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Qube Companies</span>
          <span>campclips.qubecompanies.com</span>
        </div>
      </footer>
    </div>
  );
}
