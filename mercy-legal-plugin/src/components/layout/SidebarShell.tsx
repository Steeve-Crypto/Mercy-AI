import { ReactNode } from "react";
import { motion } from "framer-motion";
import "./SidebarShell.css";

interface SidebarShellProps {
  children: ReactNode;
}

export function SidebarShell({ children }: SidebarShellProps) {
  return (
    <motion.div
      className="sidebarShell"
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
