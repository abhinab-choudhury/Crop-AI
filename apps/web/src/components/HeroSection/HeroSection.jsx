import React, { useEffect, useMemo, useState } from 'react';
import './HeroSection.css';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import ChatScreen from '../../assets/phone.jpg';
import { FaGithub, FaYoutube } from 'react-icons/fa';

export default function HeroSection() {
  const container = useMemo(
    () => ({
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: { staggerChildren: 0.45, delayChildren: 0.15 },
      },
    }),
    [],
  );

  const leftStack = useMemo(
    () => ({
      hidden: {},
      show: {
        transition: { staggerChildren: 0.28, delayChildren: 0.2 },
      },
    }),
    [],
  );

  const fadeUp = useMemo(
    () => ({
      hidden: { opacity: 0, y: 26, scale: 0.985, filter: 'blur(8px)' },
      show: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
      },
    }),
    [],
  );

  const rightEnter = useMemo(
    () => ({
      hidden: { opacity: 0, y: 50, rotateY: -8, scale: 0.96, filter: 'blur(10px)' },
      show: {
        opacity: 1,
        y: 0,
        rotateY: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: { duration: 1.1, ease: [0.16, 1, 0.3, 1] },
      },
    }),
    [],
  );

  const features = [
    'Multilingual Conversational chat interface',
    'Image upload for disease detection',
    'Voice input ready',
  ];
  const words = useMemo(
    () => [
      'Insights', // English baseline
      'अंतरदृष्टि', // Hindi
      'অন্তর্দৃষ্টি', // Bengali
      'நுண்ணறிவு', // Tamil
      'உள்ளுணர்வு', // Tamil
      'অন্তদৃষ্টি', // Bengali
    ],
    [],
  );
  const [wIndex, setWIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWIndex((i) => (i + 1) % words.length), 2200);
    return () => clearInterval(t);
  }, [words.length]);

  return (
    <section className="hero" id="hero">
      <motion.div
        className="hero-inner"
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
      >
        <motion.div className="hero-left" variants={leftStack}>
          <motion.div className="badge" variants={fadeUp}>
            🌱 AI-Powered Agriculture
          </motion.div>
          <motion.h1 className="hero-title" variants={fadeUp}>
            Empowering Farmers <br />
            <span>with</span>{' '}
            <span className="accent">
              <motion.span
                key={wIndex}
                initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="rotating-word"
              >
                {words[wIndex]}
              </motion.span>
            </span>
          </motion.h1>
          <motion.p className="hero-sub" variants={fadeUp}>
            Real-time crop guidance, disease detection from images, and multilingual chat—
            purpose-built to support farmers across India.
          </motion.p>

          <motion.div className="hero-ctas" variants={fadeUp}>
            <a
              target="_blank"
              href="https://www.youtube.com/watch?v=zUs26gJMBTo"
              className="btn btn-primary"
            >
              <FaYoutube size={20} />
              Youtube Demo
            </a>
            <a href="https://github.com/abhinab-choudhury/crop-ai" className="btn btn-outline">
              <FaGithub />
              Github
            </a>
          </motion.div>

          <motion.ul className="feature-list" variants={fadeUp}>
            {features.map((feat, i) => (
              <motion.li
                className="feature-item"
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: { opacity: 1, y: 0 },
                }}
                transition={{ type: 'spring', stiffness: 140, damping: 20 }}
              >
                <span className="feature-icon">✔️</span>
                <span className="feature-text">{feat}</span>
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>

        <motion.div className="hero-right" variants={rightEnter}>
          <div className="phone-container">
            <div className="phone-frame">
              <img src={ChatScreen} alt="Crop AI Mobile App" />
            </div>
            <div className="floating-elements">
              <div className="floating-card card-1">
                <div className="card-icon"></div>
                <span>Crops Recommendation</span>
              </div>
              <div className="floating-card card-2">
                <div className="card-icon"></div>
                <span>Crops Diseases</span>
              </div>
              <div className="floating-card card-3">
                <div className="card-icon"></div>
                <span>AI Assistant</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="blob blob-3"></div>
    </section>
  );
}
