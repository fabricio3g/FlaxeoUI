import { defineComponent, h, type Component } from 'vue'
import {
  Activity as MotionActivity,
  ArrowRight as MotionArrowRight,
  ArrowUp as MotionArrowUp,
  Brush as MotionBrush,
  Check as MotionCheck,
  ChevronDown as MotionChevronDown,
  ChevronLeft as MotionChevronLeft,
  ChevronRight as MotionChevronRight,
  ChevronUp as MotionChevronUp,
  Clapperboard as MotionClapperboard,
  Copy as MotionCopy,
  Cpu as MotionCpu,
  DatabaseBackup as MotionDatabaseBackup,
  Download as MotionDownload,
  FolderOpen as MotionFolderOpen,
  Frame as MotionFrame,
  GalleryVertical as MotionGalleryVertical,
  GripHorizontal as MotionGripHorizontal,
  LayoutGrid as MotionLayoutGrid,
  Maximize2 as MotionMaximize2,
  Moon as MotionMoon,
  Play as MotionPlay,
  Plus as MotionPlus,
  RefreshCw as MotionRefreshCw,
  Search as MotionSearch,
  Settings as MotionSettings,
  SlidersHorizontal as MotionSlidersHorizontal,
  Shrink as MotionShrink,
  Sun as MotionSun,
  Terminal as MotionTerminal,
  Upload as MotionUpload,
  User as MotionUser,
  WandSparkles as MotionWandSparkles,
  X as MotionX,
  Zap as MotionZap
} from '@respeak/lucide-motion-vue'
import {
  AlertTriangle as StaticAlertTriangle,
  CheckCircle as StaticCheckCircle,
  CheckCircle2 as StaticCheckCircle2,
  Eraser as StaticEraser,
  ExternalLink as StaticExternalLink,
  FileCode as StaticFileCode,
  Film as StaticFilm,
  Grid as StaticGrid,
  Image as StaticImage,
  ImagePlus as StaticImagePlus,
  Info as StaticInfo,
  Loader2 as StaticLoader2,
  Minus as StaticMinus,
  Save as StaticSave,
  Server as StaticServer,
  Sparkles as StaticSparkles,
  Square as StaticSquare,
  Trash2 as StaticTrash2,
  XCircle as StaticXCircle
} from 'lucide-vue-next'

function animatedIcon(icon: Component, animation?: string): Component {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () =>
        h(icon, {
          ...attrs,
          animateOnHover: true,
          animateOnTap: true,
          triggerTarget: 'parent',
          ...(animation ? { animation } : {})
        })
    }
  })
}

function fallbackIcon(icon: Component): Component {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(icon, { ...attrs, class: attrs.class })
    }
  })
}

export const Activity = animatedIcon(MotionActivity, 'lucide-animated')
export const AlertTriangle = fallbackIcon(StaticAlertTriangle)
export const ArrowRight = animatedIcon(MotionArrowRight, 'lucide-animated')
export const ArrowUp = animatedIcon(MotionArrowUp, 'lucide-animated')
export const Brush = animatedIcon(MotionBrush, 'lucide-animated')
export const Check = animatedIcon(MotionCheck, 'lucide-animated')
export const CheckCircle = fallbackIcon(StaticCheckCircle)
export const CheckCircle2 = fallbackIcon(StaticCheckCircle2)
export const ChevronDown = animatedIcon(MotionChevronDown, 'lucide-animated')
export const ChevronLeft = animatedIcon(MotionChevronLeft, 'lucide-animated')
export const ChevronRight = animatedIcon(MotionChevronRight, 'lucide-animated')
export const ChevronUp = animatedIcon(MotionChevronUp, 'lucide-animated')
export const Copy = animatedIcon(MotionCopy, 'lucide-animated')
export const Cpu = animatedIcon(MotionCpu)
export const Database = animatedIcon(MotionDatabaseBackup)
export const Download = animatedIcon(MotionDownload, 'lucide-animated')
export const Eraser = fallbackIcon(StaticEraser)
export const ExternalLink = fallbackIcon(StaticExternalLink)
export const FileCode = fallbackIcon(StaticFileCode)
export const Film = fallbackIcon(StaticFilm)
export const FolderOpen = animatedIcon(MotionFolderOpen)
export const Grid = fallbackIcon(StaticGrid)
export const GripHorizontal = animatedIcon(MotionGripHorizontal)
export const Image = fallbackIcon(StaticImage)
export const ImageIcon = animatedIcon(MotionFrame, 'lucide-animated')
export const ImagePlus = fallbackIcon(StaticImagePlus)
export const Images = animatedIcon(MotionGalleryVertical, 'lucide-animated')
export const Info = fallbackIcon(StaticInfo)
export const LayoutGrid = animatedIcon(MotionLayoutGrid)
export const Loader2 = fallbackIcon(StaticLoader2)
export const Maximize2 = animatedIcon(MotionMaximize2)
export const Minus = fallbackIcon(StaticMinus)
export const Moon = animatedIcon(MotionMoon, 'alt')
export const Play = animatedIcon(MotionPlay, 'lucide-animated')
export const Plus = animatedIcon(MotionPlus, 'alt')
export const RefreshCw = animatedIcon(MotionRefreshCw, 'lucide-animated')
export const Save = fallbackIcon(StaticSave)
export const Scale = animatedIcon(MotionShrink, 'lucide-animated')
export const Search = animatedIcon(MotionSearch, 'lucide-animated')
export const Server = fallbackIcon(StaticServer)
export const Settings = animatedIcon(MotionSettings, 'lucide-animated')
export const SlidersHorizontal = animatedIcon(MotionSlidersHorizontal, 'lucide-animated')
export const Sparkles = fallbackIcon(StaticSparkles)
export const Square = fallbackIcon(StaticSquare)
export const Sun = animatedIcon(MotionSun, 'alt')
export const Terminal = animatedIcon(MotionTerminal, 'alt')
export const Trash2 = fallbackIcon(StaticTrash2)
export const Upload = animatedIcon(MotionUpload, 'lucide-animated')
export const User = animatedIcon(MotionUser, 'lucide-animated')
export const Video = animatedIcon(MotionClapperboard, 'lucide-animated')
export const Wand2 = animatedIcon(MotionWandSparkles)
export const X = animatedIcon(MotionX, 'alt')
export const XCircle = fallbackIcon(StaticXCircle)
export const Zap = animatedIcon(MotionZap)
