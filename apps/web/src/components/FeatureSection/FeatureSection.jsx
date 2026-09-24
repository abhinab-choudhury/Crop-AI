import React from 'react';
import { motion } from 'motion/react';
import {
  FaShieldAlt,
  FaLanguage,
  FaMicrophoneAlt,
  FaCameraRetro,
  FaLeaf,
  FaRobot,
  FaExchangeAlt,
  FaCloudDownloadAlt,
  FaSyncAlt,
  FaMobileAlt,
  FaMapMarkedAlt,
} from 'react-icons/fa';
import './FeatureSection.css';

export default function FeaturesSection() {
  const headVariants = {
    hidden: { opacity: 0, y: 30, filter: 'blur(8px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
    },
  };
  const rowVariants = {
    hidden: { opacity: 0, y: 24 },
    show: (i = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
    }),
  };

  return (
    <section className="features lux-bg" id="features">
      <div className="features-inner container">
        <motion.div
          className="features-head"
          variants={headVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.5 }}
        >
          <span className="eyebrow">What CropAI Delivers</span>
          <h2 className="title super">
            AI guidance, disease insights, and multilingual support for every farmer
          </h2>
          <p className="subtitle">
            Built for the realities of Indian agriculture: snap a leaf, get a diagnosis, chat in
            your language, and receive crop and rotation guidance you can act on.
          </p>
        </motion.div>

        <motion.div
          className="feature-row"
          variants={rowVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
          custom={0}
        >
          <div className="feature-row-media left media-icon">
            <FaCameraRetro className="media-fa" />
          </div>
          <div className="feature-row-content">
            <h3>Point, Capture, Diagnose</h3>
            <p>
              Analyze leaf photos to detect diseases and nutrient stress. Get field-proven remedies
              and preventive measures you can apply right away.
            </p>
            <div className="chips">
              <span className="chip">
                <FaCameraRetro /> Camera + gallery
              </span>
              <span className="chip">
                <FaShieldAlt /> Confidence scores
              </span>
              <span className="chip">
                <FaCloudDownloadAlt /> Offline sync
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="feature-row reverse"
          variants={rowVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
          custom={1}
        >
          <div className="feature-row-media right media-icon">
            <FaRobot className="media-fa" />
          </div>
          <div className="feature-row-content">
            <h3>Talk naturally in your language</h3>
            <p>
              A multilingual chat assistant for crop queries, inputs, weather, and best
              practices—accurate, farmer-friendly, and privacy aware.
            </p>
            <div className="chips">
              <span className="chip">
                <FaLanguage /> English · हिन्दी · বাংলা · தமிழ்
              </span>
              <span className="chip">
                <FaMicrophoneAlt /> Voice input
              </span>
              <span className="chip">
                <FaShieldAlt /> Private by design
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="feature-row"
          variants={rowVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
          custom={2}
        >
          <div className="feature-row-media left media-icon">
            <FaLeaf className="media-fa" />
          </div>
          <div className="feature-row-content">
            <h3>Best crop suggestions for your field</h3>
            <p>
              Recommendations tuned to soil type, region, and seasonality with practical input plans
              to maximize yield and minimize risk.
            </p>
            <div className="chips">
              <span className="chip">
                <FaMapMarkedAlt /> Region specific
              </span>
              <span className="chip">
                <FaSyncAlt /> Adaptive models
              </span>
              <span className="chip">
                <FaMobileAlt /> Works on phones
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="feature-row reverse"
          variants={rowVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
          custom={3}
        >
          <div className="feature-row-media right media-icon">
            <FaExchangeAlt className="media-fa" />
          </div>
          <div className="feature-row-content">
            <h3>Rotation planning that protects soil</h3>
            <p>
              Healthy rotations to sustain soil quality and break pest cycles, with actionable
              sequences you can follow season to season.
            </p>
            <div className="chips">
              <span className="chip">
                <FaLeaf /> Soil first
              </span>
              <span className="chip">
                <FaCloudDownloadAlt /> Downloadable plans
              </span>
              <span className="chip">
                <FaShieldAlt /> crop rotations
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
