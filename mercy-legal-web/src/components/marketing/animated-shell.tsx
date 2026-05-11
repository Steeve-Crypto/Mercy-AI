"use client";

import { motion, type MotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type AnimatedShellProps = MotionProps & {
  children: React.ReactNode;
  className?: string;
};

export function AnimatedShell({ children, className, ...props }: AnimatedShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
