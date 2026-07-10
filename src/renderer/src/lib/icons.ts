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
  Copy as MotionCopy,
  Cpu as MotionCpu,
  Download as MotionDownload,
  ExternalLink as MotionExternalLink,
  FolderOpen as MotionFolderOpen,
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
  Sparkles as MotionSparkles,
  Sun as MotionSun,
  Terminal as MotionTerminal,
  Trash2 as MotionTrash2,
  Upload as MotionUpload,
  User as MotionUser,
  X as MotionX,
  Zap as MotionZap
} from '@respeak/lucide-motion-vue'
import {
  AlertTriangle as StaticAlertTriangle,
  CheckCircle as StaticCheckCircle,
  CheckCircle2 as StaticCheckCircle2,
  Database as StaticDatabase,
  Eraser as StaticEraser,
  FileCode as StaticFileCode,
  Film as StaticFilm,
  Grid as StaticGrid,
  Image as StaticImage,
  ImageIcon as StaticImageIcon,
  ImagePlus as StaticImagePlus,
  Images as StaticImages,
  Info as StaticInfo,
  Loader2 as StaticLoader2,
  Minus as StaticMinus,
  Save as StaticSave,
  Scale as StaticScale,
  Server as StaticServer,
  Square as StaticSquare,
  Video as StaticVideo,
  Wand2 as StaticWand2,
  XCircle as StaticXCircle
} from 'lucide-vue-next'

function animatedIcon(icon: Component): Component {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(icon, { ...attrs, animateOnHover: true, animateOnTap: true })
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

export const Activity = animatedIcon(MotionActivity)
export const AlertTriangle = fallbackIcon(StaticAlertTriangle)
export const ArrowRight = animatedIcon(MotionArrowRight)
export const ArrowUp = animatedIcon(MotionArrowUp)
export const Brush = animatedIcon(MotionBrush)
export const Check = animatedIcon(MotionCheck)
export const CheckCircle = fallbackIcon(StaticCheckCircle)
export const CheckCircle2 = fallbackIcon(StaticCheckCircle2)
export const ChevronDown = animatedIcon(MotionChevronDown)
export const ChevronLeft = animatedIcon(MotionChevronLeft)
export const ChevronRight = animatedIcon(MotionChevronRight)
export const ChevronUp = animatedIcon(MotionChevronUp)
export const Copy = animatedIcon(MotionCopy)
export const Cpu = animatedIcon(MotionCpu)
export const Database = fallbackIcon(StaticDatabase)
export const Download = animatedIcon(MotionDownload)
export const Eraser = fallbackIcon(StaticEraser)
export const ExternalLink = animatedIcon(MotionExternalLink)
export const FileCode = fallbackIcon(StaticFileCode)
export const Film = fallbackIcon(StaticFilm)
export const FolderOpen = animatedIcon(MotionFolderOpen)
export const Grid = fallbackIcon(StaticGrid)
export const GripHorizontal = animatedIcon(MotionGripHorizontal)
export const Image = fallbackIcon(StaticImage)
export const ImageIcon = fallbackIcon(StaticImageIcon)
export const ImagePlus = fallbackIcon(StaticImagePlus)
export const Images = fallbackIcon(StaticImages)
export const Info = fallbackIcon(StaticInfo)
export const LayoutGrid = animatedIcon(MotionLayoutGrid)
export const Loader2 = fallbackIcon(StaticLoader2)
export const Maximize2 = animatedIcon(MotionMaximize2)
export const Minus = fallbackIcon(StaticMinus)
export const Moon = animatedIcon(MotionMoon)
export const Play = animatedIcon(MotionPlay)
export const Plus = animatedIcon(MotionPlus)
export const RefreshCw = animatedIcon(MotionRefreshCw)
export const Save = fallbackIcon(StaticSave)
export const Scale = fallbackIcon(StaticScale)
export const Search = animatedIcon(MotionSearch)
export const Server = fallbackIcon(StaticServer)
export const Settings = animatedIcon(MotionSettings)
export const SlidersHorizontal = animatedIcon(MotionSlidersHorizontal)
export const Sparkles = animatedIcon(MotionSparkles)
export const Square = fallbackIcon(StaticSquare)
export const Sun = animatedIcon(MotionSun)
export const Terminal = animatedIcon(MotionTerminal)
export const Trash2 = animatedIcon(MotionTrash2)
export const Upload = animatedIcon(MotionUpload)
export const User = animatedIcon(MotionUser)
export const Video = fallbackIcon(StaticVideo)
export const Wand2 = fallbackIcon(StaticWand2)
export const X = animatedIcon(MotionX)
export const XCircle = fallbackIcon(StaticXCircle)
export const Zap = animatedIcon(MotionZap)
