import { motion } from "framer-motion";

interface MercyLogoProps {
  active?: boolean;
}

export function MercyLogo({ active = false }: MercyLogoProps) {
  return (
    <motion.div
      className="mercyLogo"
      animate={{
        boxShadow: active
          ? ["0 0 0 rgba(201,164,76,0)", "0 0 0 8px rgba(201,164,76,0.14)", "0 0 0 rgba(201,164,76,0)"]
          : "0 6px 18px rgba(14,42,74,0.16)"
      }}
      transition={{ duration: 1.25, repeat: active ? Infinity : 0 }}
      aria-label="Mercy Legal"
    >
      <span>M</span>
    </motion.div>
  );
}
