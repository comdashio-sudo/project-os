import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/contexts/ThemeContext";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  AlertCircle,
  CalendarIcon,
  Check,
  Clock,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast as sonnerToast } from "sonner";
import { AIChatBox, type Message } from "@/components/AIChatBox";

export default function ComponentsShowcase() {
  const { language } = useLanguage();
  const t = pickLanguage(language, {
    ar: { inputLabel: "المدخل",
      s1: "تم الإرسال بنجاح",
      s2: "مكتبة مكونات Shadcn/ui",
      s3: "ألوان النص",
      s4: "المقدمة (افتراضي)",
      s5: "لون النص الافتراضي للمحتوى الرئيسي",
      s6: "النص الأمامي الخافت",
      s7: "نص خافت للمعلومات الثانوية",
      s8: "أساسي",
      s9: "نص بلون العلامة الأساسي",
      s10: "النص الأمامي الثانوي",
      s11: "لون نص الإجراء الثانوي",
      s12: "النص الأمامي المميز",
      s13: "نص مميز للتأكيد",
      s14: "تدميري",
      s15: "نص الخطأ أو الإجراء المدمّر",
      s16: "النص الأمامي للبطاقة",
      s17: "لون النص على خلفيات البطاقات",
      s18: "النص الأمامي للنافذة المنبثقة",
      s19: "لون النص في النوافذ المنبثقة",
      s20: "تركيبات الألوان",
      s21: "خلفية أساسية مع نص أمامي",
      s22: "ثانوي",
      s23: "خلفية ثانوية مع نص أمامي",
      s24: "خافت",
      s25: "خلفية خافتة مع نص أمامي",
      s26: "مميّز",
      s27: "خلفية مميزة مع نص أمامي",
      s28: "خلفية تدميرية مع نص أمامي",
      s29: "بطاقة",
      s30: "خلفية البطاقة مع نص أمامي",
      s31: "نافذة منبثقة",
      s32: "خلفية النافذة المنبثقة مع نص أمامي",
      s33: "الخلفية",
      s34: "خلفية افتراضية مع نص أمامي",
      s35: "الأزرار",
      s36: "افتراضي",
      s37: "محيط فقط",
      s38: "شفاف",
      s39: "رابط",
      s40: "صغير",
      s41: "كبير",
      s42: "حقول النماذج",
      s43: "البريد الإلكتروني",
      s44: "الرسالة",
      s45: "اكتب رسالتك هنا.",
      s46: "اختيار",
      s47: "اختر فاكهة",
      s48: "تفاحة",
      s49: "موز",
      s50: "برتقالي",
      s51: "أوافق على الشروط والأحكام",
      s52: "وضع الطيران",
      s53: "مجموعة أزرار الاختيار",
      s54: "الخيار الأول",
      s55: "الخيار الثاني",
      s56: "منزلق",
      s57: "إدخال رمز التحقق لمرة واحدة",
      s58: "منتقي التاريخ والوقت",
      s59: "اختر التاريخ والوقت",
      s60: "الوقت",
      s61: "المحدد:",
      s62: "قائمة منسدلة قابلة للبحث",
      s63: "اختر الإطار...",
      s64: "ابحث عن الأطر...",
      s65: "لم يُعثر على إطار عمل",
      s66: "الشهر",
      s67: "MM",
      s68: "السنة",
      s69: "YYYY",
      s70: "عرض البيانات",
      s71: "الشارات",
      s72: "الصورة الرمزية",
      s73: "CN",
      s74: "AB",
      s75: "التقدم",
      s76: "هيكل التحميل",
      s77: "ترقيم الصفحات",
      s78: "الصفحة الحالية:",
      s79: "جدول",
      s80: "قائمة بأحدث فواتيرك.",
      s81: "فاتورة",
      s82: "الحالة",
      s83: "الطريقة",
      s84: "المبلغ",
      s85: "INV001",
      s86: "مدفوع",
      s87: "بطاقة ائتمان",
      s88: "INV002",
      s89: "قيد الانتظار",
      s90: "PayPal",
      s91: "INV003",
      s92: "غير مدفوع",
      s93: "تحويل بنكي",
      s94: "شريط القوائم",
      s95: "ملف",
      s96: "تبويب جديد",
      s97: "نافذة جديدة",
      s98: "مشاركة",
      s99: "طباعة",
      s100: "تعديل",
      s101: "تراجع",
      s102: "إعادة",
      s103: "عرض",
      s104: "إعادة التحميل",
      s105: "إعادة تحميل قسري",
      s106: "مسار التنقل",
      s107: "الرئيسية",
      s108: "المكونات",
      s109: "التنبيهات",
      s110: "انتبه!",
      s111: "يمكنك إضافة المكونات إلى تطبيقك باستخدام CLI.",
      s112: "خطأ",
      s113: "انتهت جلستك. يُرجى تسجيل الدخول مرة أخرى.",
      s114: "علامات التبويب",
      s115: "الحساب",
      s116: "كلمة المرور",
      s117: "الإعدادات",
      s118: "أجرِ التعديلات على حسابك هنا.",
      s119: "الاسم",
      s120: "حفظ التغييرات",
      s121: "غيّر كلمة المرور هنا.",
      s122: "كلمة المرور الحالية",
      s123: "كلمة مرور جديدة",
      s124: "حفظ كلمة المرور",
      s125: "أدِر إعداداتك هنا.",
      s126: "محتوى الإعدادات يظهر هنا.",
      s127: "أكورديون",
      s128: "هل هو سهل الوصول؟",
      s129: "نعم. يلتزم بنمط تصميم WAI-ARIA.",
      s130: "هل له تنسيق؟",
      s131: "نعم. تأتي بأنماط افتراضية تتناسق مع أسلوب المكونات الأخرى.",
      s132: "هل فيه حركة؟",
      s133: "نعم. تأتي بحركة افتراضيًا، ويمكنك تعطيلها إن أردت.",
      s134: "قابل للطي",
      s135: "قام @peduarte بتمييز 3 مستودعات بنجمة",
      s136: "@radix-ui/primitives",
      s137: "@radix-ui/colors",
      s138: "@stitches/react",
      s139: "الطبقات المتراكبة",
      s140: "فتح الحوار",
      s141: "حقل اختبار",
      s142: "أدخل نصًا أدناه. اضغط Enter للإرسال (يُدعم إدخال IME).",
      s143: "حقل الإدخال",
      s144: "اكتب شيئًا...",
      s145: "إلغاء",
      s146: "إرسال",
      s147: "فتح الورقة الجانبية",
      s148: "تعديل الملف الشخصي",
      s149: "عدّل ملفك الشخصي هنا. انقر حفظ عند الانتهاء.",
      s150: "فتح الدرج",
      s151: "هل أنت متأكد تمامًا؟",
      s152: "لا يمكن التراجع عن هذا الإجراء.",
      s153: "فتح النافذة المنبثقة",
      s154: "الأبعاد",
      s155: "حدّد أبعاد الطبقة.",
      s156: "مرّر المؤشر فوقي",
      s157: "أضف إلى المكتبة",
      s158: "القوائم",
      s159: "قائمة منسدلة",
      s160: "حسابي",
      s161: "الملف الشخصي",
      s162: "الفوترة",
      s163: "الفريق",
      s164: "الاشتراك",
      s165: "انقر بالزر الأيمن عليّ",
      s166: "بطاقة التمرير",
      s167: "@nextjs",
      s168: "إطار React – أنشأه @vercel ويتولى صيانته.",
      s169: "التقويم",
      s170: "عارض الشرائح",
      s171: "تبديل",
      s172: "تبديل الخط المائل",
      s173: "تبديل التسطير",
      s174: "مجموعة التبديل",
      s175: "تبديل الخط الغامق",
      s176: "مكونات التخطيط",
      s177: "نسبة العرض (16/9)",
      s178: "نسبة العرض 16:9",
      s179: "منطقة التمرير",
      s180: "عنصر",
      s181: ": هذه منطقة محتوى قابلة للتمرير",
      s182: "لوحات قابلة لتغيير الحجم",
      s183: "اللوحة الأولى",
      s184: "اللوحة الثانية",
      s185: "إشعار منبثق",
      s186: "إشعار Sonner",
      s187: "تمت العملية بنجاح",
      s188: "تم حفظ تغييراتك",
      s189: "نجاح",
      s190: "فشلت العملية",
      s191: "تعذّر إكمال العملية، يُرجى المحاولة مرة أخرى",
      s192: "هذه رسالة معلومات",
      s193: "معلومة",
      s194: "يُرجى الانتباه إلى أثر هذه العملية",
      s195: "تحذير",
      s196: "يُرجى الانتظار",
      s197: "جارٍ التحميل",
      s198: "اكتملت المعالجة!",
      s199: "فشلت المعالجة",
      s200: "وعد",
      s201: "صندوق محادثة الذكاء الاصطناعي",
      s202: "مكوّن جاهز لواجهة المحادثة يتكامل مع نظام نماذج اللغة. يدعم عرض Markdown والتمرير التلقائي وحالات التحميل.",
      s203: "هذا عرض تجريبي بردود محاكاة. في التطبيق الفعلي توصله بعملية tRPC mutation.",
      s204: "جرّب إرسال رسالة...",
      s205: "ما هو React؟",
      s206: "اشرح TypeScript",
      s207: "كيف أستخدم tRPC؟",
      s208: "أفضل ممارسات تطوير الويب",
      s209: "عرض مكونات Shadcn/ui",
    },
    en: { inputLabel: "Input",
      s1: "Submitted successfully",
      s2: "Shadcn/ui Component Library",
      s3: "Text Colors",
      s4: "Foreground (Default)",
      s5: "Default text color for main content",
      s6: "Muted Foreground",
      s7: "Muted text for secondary information",
      s8: "Primary",
      s9: "Primary brand color text",
      s10: "Secondary Foreground",
      s11: "Secondary action text color",
      s12: "Accent Foreground",
      s13: "Accent text for emphasis",
      s14: "Destructive",
      s15: "Error or destructive action text",
      s16: "Card Foreground",
      s17: "Text color on card backgrounds",
      s18: "Popover Foreground",
      s19: "Text color in popovers",
      s20: "Color Combinations",
      s21: "Primary background with foreground text",
      s22: "Secondary",
      s23: "Secondary background with foreground text",
      s24: "Muted",
      s25: "Muted background with foreground text",
      s26: "Accent",
      s27: "Accent background with foreground text",
      s28: "Destructive background with foreground text",
      s29: "Card",
      s30: "Card background with foreground text",
      s31: "Popover",
      s32: "Popover background with foreground text",
      s33: "Background",
      s34: "Default background with foreground text",
      s35: "Buttons",
      s36: "Default",
      s37: "Outline",
      s38: "Ghost",
      s39: "Link",
      s40: "Small",
      s41: "Large",
      s42: "Form Inputs",
      s43: "Email",
      s44: "Message",
      s45: "Type your message here.",
      s46: "Select",
      s47: "Select a fruit",
      s48: "Apple",
      s49: "Banana",
      s50: "Orange",
      s51: "Accept terms and conditions",
      s52: "Airplane Mode",
      s53: "Radio Group",
      s54: "Option One",
      s55: "Option Two",
      s56: "Slider",
      s57: "Input OTP",
      s58: "Date Time Picker",
      s59: "Select date and time",
      s60: "Time",
      s61: "Selected:",
      s62: "Searchable Dropdown",
      s63: "Select framework...",
      s64: "Search frameworks...",
      s65: "No framework found",
      s66: "Month",
      s67: "MM",
      s68: "Year",
      s69: "YYYY",
      s70: "Data Display",
      s71: "Badges",
      s72: "Avatar",
      s73: "CN",
      s74: "AB",
      s75: "Progress",
      s76: "Skeleton",
      s77: "Pagination",
      s78: "Current page:",
      s79: "Table",
      s80: "A list of your recent invoices.",
      s81: "Invoice",
      s82: "Status",
      s83: "Method",
      s84: "Amount",
      s85: "INV001",
      s86: "Paid",
      s87: "Credit Card",
      s88: "INV002",
      s89: "Pending",
      s90: "PayPal",
      s91: "INV003",
      s92: "Unpaid",
      s93: "Bank Transfer",
      s94: "Menubar",
      s95: "File",
      s96: "New Tab",
      s97: "New Window",
      s98: "Share",
      s99: "Print",
      s100: "Edit",
      s101: "Undo",
      s102: "Redo",
      s103: "View",
      s104: "Reload",
      s105: "Force Reload",
      s106: "Breadcrumb",
      s107: "Home",
      s108: "Components",
      s109: "Alerts",
      s110: "Heads up!",
      s111: "You can add components to your app using the cli.",
      s112: "Error",
      s113: "Your session has expired. Please log in again.",
      s114: "Tabs",
      s115: "Account",
      s116: "Password",
      s117: "Settings",
      s118: "Make changes to your account here.",
      s119: "Name",
      s120: "Save changes",
      s121: "Change your password here.",
      s122: "Current password",
      s123: "New password",
      s124: "Save password",
      s125: "Manage your settings here.",
      s126: "Settings content goes here.",
      s127: "Accordion",
      s128: "Is it accessible?",
      s129: "Yes. It adheres to the WAI-ARIA design pattern.",
      s130: "Is it styled?",
      s131: "Yes. It comes with default styles that matches the other components' aesthetic.",
      s132: "Is it animated?",
      s133: "Yes. It's animated by default, but you can disable it if you prefer.",
      s134: "Collapsible",
      s135: "@peduarte starred 3 repositories",
      s136: "@radix-ui/primitives",
      s137: "@radix-ui/colors",
      s138: "@stitches/react",
      s139: "Overlays",
      s140: "Open Dialog",
      s141: "Test Input",
      s142: "Enter some text below. Press Enter to submit (IME composition supported).",
      s143: "Input",
      s144: "Type something...",
      s145: "Cancel",
      s146: "Submit",
      s147: "Open Sheet",
      s148: "Edit profile",
      s149: "Make changes to your profile here. Click save when you're done.",
      s150: "Open Drawer",
      s151: "Are you absolutely sure?",
      s152: "This action cannot be undone.",
      s153: "Open Popover",
      s154: "Dimensions",
      s155: "Set the dimensions for the layer.",
      s156: "Hover me",
      s157: "Add to library",
      s158: "Menus",
      s159: "Dropdown Menu",
      s160: "My Account",
      s161: "Profile",
      s162: "Billing",
      s163: "Team",
      s164: "Subscription",
      s165: "Right Click Me",
      s166: "Hover Card",
      s167: "@nextjs",
      s168: "The React Framework – created and maintained by @vercel.",
      s169: "Calendar",
      s170: "Carousel",
      s171: "Toggle",
      s172: "Toggle italic",
      s173: "Toggle underline",
      s174: "Toggle Group",
      s175: "Toggle bold",
      s176: "Layout Components",
      s177: "Aspect Ratio (16/9)",
      s178: "16:9 Aspect Ratio",
      s179: "Scroll Area",
      s180: "Item",
      s181: ": This is a scrollable content area",
      s182: "Resizable Panels",
      s183: "Panel One",
      s184: "Panel Two",
      s185: "Toast",
      s186: "Sonner Toast",
      s187: "Operation successful",
      s188: "Your changes have been saved",
      s189: "Success",
      s190: "Operation failed",
      s191: "Cannot complete operation, please try again",
      s192: "This is an information message",
      s193: "Info",
      s194: "Please note the impact of this operation",
      s195: "Warning",
      s196: "Please wait",
      s197: "Loading",
      s198: "Processing complete!",
      s199: "Processing failed",
      s200: "Promise",
      s201: "AI ChatBox",
      s202: "A ready-to-use chat interface component that integrates with the LLM system. Features markdown rendering, auto-scrolling, and loading states.",
      s203: "This is a demo with simulated responses. In a real app, you'd connect it to a tRPC mutation.",
      s204: "Try sending a message...",
      s205: "What is React?",
      s206: "Explain TypeScript",
      s207: "How to use tRPC?",
      s208: "Best practices for web development",
      s209: "Shadcn/ui Component Showcase",
    },
    ur: { inputLabel: "ان پٹ",
      s1: "کامیابی سے جمع ہو گیا",
      s2: "Shadcn/ui کمپوننٹ لائبریری",
      s3: "متن کے رنگ",
      s4: "فورگراؤنڈ (ڈیفالٹ)",
      s5: "مرکزی مواد کے لیے ڈیفالٹ متن کا رنگ",
      s6: "مدھم فورگراؤنڈ",
      s7: "ثانوی معلومات کے لیے مدھم متن",
      s8: "بنیادی",
      s9: "بنیادی برانڈ رنگ کا متن",
      s10: "ثانوی فورگراؤنڈ",
      s11: "ثانوی عمل کے متن کا رنگ",
      s12: "لہجہ فورگراؤنڈ",
      s13: "زور دینے کے لیے لہجے کا متن",
      s14: "خطرناک",
      s15: "خرابی یا خطرناک عمل کا متن",
      s16: "کارڈ فورگراؤنڈ",
      s17: "کارڈ کے پس منظر پر متن کا رنگ",
      s18: "پاپ اوور فورگراؤنڈ",
      s19: "پاپ اوور میں متن کا رنگ",
      s20: "رنگوں کے امتزاج",
      s21: "بنیادی پس منظر کے ساتھ اگلا متن",
      s22: "ثانوی",
      s23: "ثانوی پس منظر کے ساتھ اگلا متن",
      s24: "مدھم",
      s25: "مدھم پس منظر کے ساتھ اگلا متن",
      s26: "لہجہ",
      s27: "لہجے کے پس منظر کے ساتھ اگلا متن",
      s28: "خطرناک پس منظر کے ساتھ اگلا متن",
      s29: "کارڈ",
      s30: "کارڈ کے پس منظر کے ساتھ اگلا متن",
      s31: "Popover",
      s32: "پاپ اوور کے پس منظر کے ساتھ اگلا متن",
      s33: "پس منظر",
      s34: "ڈیفالٹ پس منظر کے ساتھ اگلا متن",
      s35: "بٹنز",
      s36: "ڈیفالٹ",
      s37: "صرف خاکہ",
      s38: "Ghost",
      s39: "لنک",
      s40: "چھوٹا",
      s41: "بڑا",
      s42: "فارم ان پٹس",
      s43: "ای میل",
      s44: "پیغام",
      s45: "اپنا پیغام یہاں لکھیں۔",
      s46: "منتخب کریں",
      s47: "ایک پھل منتخب کریں",
      s48: "سیب",
      s49: "کیلا",
      s50: "نارنجی",
      s51: "شرائط و ضوابط سے اتفاق کریں",
      s52: "ایئرپلین موڈ",
      s53: "Radio Group",
      s54: "آپشن ایک",
      s55: "آپشن دو",
      s56: "سلائیڈر",
      s57: "Input OTP",
      s58: "تاریخ اور وقت کا انتخاب",
      s59: "تاریخ اور وقت منتخب کریں",
      s60: "وقت",
      s61: "منتخب:",
      s62: "قابلِ تلاش ڈراپ ڈاؤن",
      s63: "فریم ورک منتخب کریں...",
      s64: "فریم ورکس تلاش کریں...",
      s65: "کوئی فریم ورک نہیں ملا",
      s66: "مہینہ",
      s67: "MM",
      s68: "سال",
      s69: "YYYY",
      s70: "ڈیٹا ڈسپلے",
      s71: "بیجز",
      s72: "Avatar",
      s73: "CN",
      s74: "AB",
      s75: "پیش رفت",
      s76: "Skeleton",
      s77: "Pagination",
      s78: "موجودہ صفحہ:",
      s79: "ٹیبل",
      s80: "آپ کی حالیہ انوائسز کی فہرست۔",
      s81: "انوائس",
      s82: "حیثیت",
      s83: "طریقہ",
      s84: "رقم",
      s85: "INV001",
      s86: "ادا شدہ",
      s87: "کریڈٹ کارڈ",
      s88: "INV002",
      s89: "زیرِ التوا",
      s90: "PayPal",
      s91: "INV003",
      s92: "غیر ادا شدہ",
      s93: "بینک ٹرانسفر",
      s94: "Menubar",
      s95: "فائل",
      s96: "نیا ٹیب",
      s97: "نئی ونڈو",
      s98: "شیئر کریں",
      s99: "پرنٹ",
      s100: "ترمیم",
      s101: "واپس کریں",
      s102: "دوبارہ کریں",
      s103: "دیکھیں",
      s104: "دوبارہ لوڈ کریں",
      s105: "زبردستی دوبارہ لوڈ کریں",
      s106: "Breadcrumb",
      s107: "ہوم",
      s108: "کمپوننٹس",
      s109: "الرٹس",
      s110: "توجہ دیں!",
      s111: "آپ CLI کے ذریعے اپنی ایپ میں کمپوننٹس شامل کر سکتے ہیں۔",
      s112: "خرابی",
      s113: "آپ کا سیشن ختم ہو گیا ہے۔ براہ کرم دوبارہ سائن ان کریں۔",
      s114: "ٹیبز",
      s115: "اکاؤنٹ",
      s116: "پاس ورڈ",
      s117: "ترتیبات",
      s118: "یہاں اپنے اکاؤنٹ میں تبدیلیاں کریں۔",
      s119: "نام",
      s120: "تبدیلیاں محفوظ کریں",
      s121: "یہاں اپنا پاس ورڈ تبدیل کریں۔",
      s122: "موجودہ پاس ورڈ",
      s123: "نیا پاس ورڈ",
      s124: "پاس ورڈ محفوظ کریں",
      s125: "اپنی ترتیبات یہاں منظم کریں۔",
      s126: "ترتیبات کا مواد یہاں ہوگا۔",
      s127: "Accordion",
      s128: "کیا یہ قابلِ رسائی ہے؟",
      s129: "جی ہاں۔ یہ WAI-ARIA ڈیزائن پیٹرن پر پورا اترتا ہے۔",
      s130: "کیا یہ اسٹائل شدہ ہے؟",
      s131: "جی ہاں۔ اس کے ساتھ ڈیفالٹ اسٹائلز آتے ہیں جو دوسرے کمپوننٹس کے انداز سے ہم آہنگ ہیں۔",
      s132: "کیا یہ متحرک ہے؟",
      s133: "جی ہاں۔ یہ ڈیفالٹ طور پر متحرک ہے، لیکن اگر آپ چاہیں تو اسے بند کر سکتے ہیں۔",
      s134: "Collapsible",
      s135: "@peduarte نے 3 ریپوزٹریز کو ستارہ دیا",
      s136: "@radix-ui/primitives",
      s137: "@radix-ui/colors",
      s138: "@stitches/react",
      s139: "اوورلیز",
      s140: "ڈائیلاگ کھولیں",
      s141: "ٹیسٹ ان پٹ",
      s142: "نیچے کچھ متن درج کریں۔ جمع کرنے کے لیے Enter دبائیں (IME کمپوزیشن سپورٹڈ ہے)۔",
      s143: "ان پٹ",
      s144: "کچھ لکھیں...",
      s145: "منسوخ کریں",
      s146: "جمع کریں",
      s147: "شیٹ کھولیں",
      s148: "پروفائل میں ترمیم کریں",
      s149: "یہاں اپنے پروفائل میں تبدیلیاں کریں۔ مکمل ہونے پر محفوظ کریں پر کلک کریں۔",
      s150: "ڈراور کھولیں",
      s151: "کیا آپ کو یقین ہے؟",
      s152: "اس عمل کو واپس نہیں کیا جا سکتا۔",
      s153: "پاپ اوور کھولیں",
      s154: "طول و عرض",
      s155: "اس پرت کے طول و عرض مقرر کریں۔",
      s156: "مجھ پر ہوور کریں",
      s157: "لائبریری میں شامل کریں",
      s158: "مینیوز",
      s159: "Dropdown Menu",
      s160: "میرا اکاؤنٹ",
      s161: "پروفائل",
      s162: "بلنگ",
      s163: "ٹیم",
      s164: "سبسکرپشن",
      s165: "مجھ پر دائیں کلک کریں",
      s166: "Hover Card",
      s167: "@nextjs",
      s168: "React فریم ورک – جسے @vercel نے بنایا اور اس کی دیکھ بھال کرتا ہے۔",
      s169: "کیلنڈر",
      s170: "Carousel",
      s171: "ٹوگل",
      s172: "ترچھا ٹوگل کریں",
      s173: "انڈر لائن ٹوگل کریں",
      s174: "ٹوگل گروپ",
      s175: "بولڈ ٹوگل کریں",
      s176: "لے آؤٹ کمپوننٹس",
      s177: "Aspect Ratio (16/9)",
      s178: "16:9 Aspect Ratio",
      s179: "Scroll Area",
      s180: "آئٹم",
      s181: ": یہ قابلِ اسکرول مواد کا علاقہ ہے۔",
      s182: "قابلِ تبدیلیِ حجم پینلز",
      s183: "پینل ایک",
      s184: "پینل دو",
      s185: "Toast",
      s186: "Sonner Toast",
      s187: "کارروائی کامیاب رہی",
      s188: "آپ کی تبدیلیاں محفوظ ہو گئی ہیں",
      s189: "کامیابی",
      s190: "کارروائی ناکام ہو گئی",
      s191: "کارروائی مکمل نہیں ہو سکی، براہ کرم دوبارہ کوشش کریں",
      s192: "یہ ایک معلوماتی پیغام ہے",
      s193: "معلومات",
      s194: "براہ کرم اس کارروائی کے اثرات نوٹ کریں",
      s195: "انتباہ",
      s196: "براہ کرم انتظار کریں",
      s197: "لوڈ ہو رہا ہے",
      s198: "پروسیسنگ مکمل ہو گئی!",
      s199: "پروسیسنگ ناکام ہو گئی",
      s200: "Promise",
      s201: "AI ChatBox",
      s202: "کمپوننٹ جو فوری استعمال کے لیے تیار چیٹ انٹرفیس ہے اور LLM سسٹم سے جڑتا ہے۔ اس میں markdown رینڈرنگ، خودکار اسکرولنگ اور لوڈنگ کی حالتیں ہیں۔",
      s203: "یہ ایک ڈیمو ہے جس میں مصنوعی جوابات ہیں۔ حقیقی ایپ میں آپ اسے tRPC mutation سے جوڑیں گے۔",
      s204: "کوئی پیغام بھیج کر دیکھیں...",
      s205: "React کیا ہے؟",
      s206: "TypeScript کی وضاحت کریں",
      s207: "tRPC کیسے استعمال کریں؟",
      s208: "ویب ڈیولپمنٹ کے بہترین طریقے",
      s209: "Shadcn/ui کمپوننٹس کا نمونہ",
    },
  });
  const { theme, toggleTheme } = useTheme();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [datePickerDate, setDatePickerDate] = useState<Date>();
  const [selectedFruits, setSelectedFruits] = useState<string[]>([]);
  const [progress, setProgress] = useState(33);
  const [currentPage, setCurrentPage] = useState(2);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [dialogInput, setDialogInput] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // AI ChatBox demo state
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: "system", content: "You are a helpful assistant." },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleDialogSubmit = () => {
    console.log("Dialog submitted with value:", dialogInput);
    sonnerToast.success(t.s1, {
      description: `${t.inputLabel}: ${dialogInput}`,
    });
    setDialogInput("");
    setDialogOpen(false);
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleDialogSubmit();
    }
  };

  const handleChatSend = (content: string) => {
    // Add user message
    const newMessages: Message[] = [...chatMessages, { role: "user", content }];
    setChatMessages(newMessages);

    // Simulate AI response with delay
    setIsChatLoading(true);
    setTimeout(() => {
      const aiResponse: Message = {
        role: "assistant",
        content: `This is a **demo response**. In a real app, you would call a tRPC mutation here:\n\n\`\`\`typescript\nconst chatMutation = trpc.ai.chat.useMutation({\n  onSuccess: (response) => {\n    setChatMessages(prev => [...prev, {\n      role: "assistant",\n      content: response.choices[0].message.content\n    }]);\n  }\n});\n\nchatMutation.mutate({ messages: newMessages });\n\`\`\`\n\nYour message was: "${content}"`,
      };
      setChatMessages([...newMessages, aiResponse]);
      setIsChatLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container max-w-6xl mx-auto">
        <div className="space-y-2 justify-between flex">
          <h2 className="text-3xl font-bold tracking-tight mb-6">
            {t.s2}
          </h2>
          <Button variant="outline" size="icon" onClick={toggleTheme}>
            {theme === "light" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </Button>
        </div>

        <div className="space-y-12">
          {/* Text Colors Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s3}</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {t.s4}
                      </p>
                      <p className="text-foreground text-lg">
                        {t.s5}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {t.s6}
                      </p>
                      <p className="text-muted-foreground text-lg">
                        {t.s7}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {t.s8}
                      </p>
                      <p className="text-primary text-lg font-medium">
                        {t.s9}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {t.s10}
                      </p>
                      <p className="text-secondary-foreground text-lg">
                        {t.s11}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {t.s12}
                      </p>
                      <p className="text-accent-foreground text-lg">
                        {t.s13}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {t.s14}
                      </p>
                      <p className="text-destructive text-lg font-medium">
                        {t.s15}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {t.s16}
                      </p>
                      <p className="text-card-foreground text-lg">
                        {t.s17}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {t.s18}
                      </p>
                      <p className="text-popover-foreground text-lg">
                        {t.s19}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Color Combinations Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s20}</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-primary text-primary-foreground rounded-lg p-4">
                    <p className="font-medium mb-1">{t.s8}</p>
                    <p className="text-sm opacity-90">
                      {t.s21}
                    </p>
                  </div>
                  <div className="bg-secondary text-secondary-foreground rounded-lg p-4">
                    <p className="font-medium mb-1">{t.s22}</p>
                    <p className="text-sm opacity-90">
                      {t.s23}
                    </p>
                  </div>
                  <div className="bg-muted text-muted-foreground rounded-lg p-4">
                    <p className="font-medium mb-1">{t.s24}</p>
                    <p className="text-sm opacity-90">
                      {t.s25}
                    </p>
                  </div>
                  <div className="bg-accent text-accent-foreground rounded-lg p-4">
                    <p className="font-medium mb-1">{t.s26}</p>
                    <p className="text-sm opacity-90">
                      {t.s27}
                    </p>
                  </div>
                  <div className="bg-destructive text-destructive-foreground rounded-lg p-4">
                    <p className="font-medium mb-1">{t.s14}</p>
                    <p className="text-sm opacity-90">
                      {t.s28}
                    </p>
                  </div>
                  <div className="bg-card text-card-foreground rounded-lg p-4 border">
                    <p className="font-medium mb-1">{t.s29}</p>
                    <p className="text-sm opacity-90">
                      {t.s30}
                    </p>
                  </div>
                  <div className="bg-popover text-popover-foreground rounded-lg p-4 border">
                    <p className="font-medium mb-1">{t.s31}</p>
                    <p className="text-sm opacity-90">
                      {t.s32}
                    </p>
                  </div>
                  <div className="bg-background text-foreground rounded-lg p-4 border">
                    <p className="font-medium mb-1">{t.s33}</p>
                    <p className="text-sm opacity-90">
                      {t.s34}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Buttons Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s35}</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4">
                  <Button>{t.s36}</Button>
                  <Button variant="secondary">{t.s22}</Button>
                  <Button variant="destructive">{t.s14}</Button>
                  <Button variant="outline">{t.s37}</Button>
                  <Button variant="ghost">{t.s38}</Button>
                  <Button variant="link">{t.s39}</Button>
                  <Button size="sm">{t.s40}</Button>
                  <Button size="lg">{t.s41}</Button>
                  <Button size="icon">
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Form Inputs Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s42}</h3>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">{t.s43}</Label>
                  <Input id="email" type="email" placeholder={t.s43} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">{t.s44}</Label>
                  <Textarea
                    id="message"
                    placeholder={t.s45}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.s46}</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder={t.s47} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apple">{t.s48}</SelectItem>
                      <SelectItem value="banana">{t.s49}</SelectItem>
                      <SelectItem value="orange">{t.s50}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" />
                  <Label htmlFor="terms">{t.s51}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="airplane-mode" />
                  <Label htmlFor="airplane-mode">{t.s52}</Label>
                </div>
                <div className="space-y-2">
                  <Label>{t.s53}</Label>
                  <RadioGroup defaultValue="option-one">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="option-one" id="option-one" />
                      <Label htmlFor="option-one">{t.s54}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="option-two" id="option-two" />
                      <Label htmlFor="option-two">{t.s55}</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>{t.s56}</Label>
                  <Slider defaultValue={[50]} max={100} step={1} />
                </div>
                <div className="space-y-2">
                  <Label>{t.s57}</Label>
                  <InputOTP maxLength={6}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <div className="space-y-2">
                  <Label>{t.s58}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left font-normal ${
                          !datePickerDate && "text-muted-foreground"
                        }`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {datePickerDate ? (
                          format(datePickerDate, "PPP HH:mm", { locale: zhCN })
                        ) : (
                          <span>{t.s59}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <div className="p-3 space-y-3">
                        <Calendar
                          mode="single"
                          selected={datePickerDate}
                          onSelect={setDatePickerDate}
                        />
                        <div className="border-t pt-3 space-y-2">
                          <Label className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {t.s60}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              type="time"
                              value={
                                datePickerDate
                                  ? format(datePickerDate, "HH:mm")
                                  : "00:00"
                              }
                              onChange={e => {
                                const [hours, minutes] =
                                  e.target.value.split(":");
                                const newDate = datePickerDate
                                  ? new Date(datePickerDate)
                                  : new Date();
                                newDate.setHours(parseInt(hours));
                                newDate.setMinutes(parseInt(minutes));
                                setDatePickerDate(newDate);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {datePickerDate && (
                    <p className="text-sm text-muted-foreground">
                      {t.s61}{" "}
                      {format(datePickerDate, "yyyy/MM/dd  HH:mm", {
                        locale: zhCN,
                      })}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t.s62}</Label>
                  <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombobox}
                        className="w-full justify-between"
                      >
                        {selectedFramework
                          ? [
                              { value: "react", label: "React" },
                              { value: "vue", label: "Vue" },
                              { value: "angular", label: "Angular" },
                              { value: "svelte", label: "Svelte" },
                              { value: "nextjs", label: "Next.js" },
                              { value: "nuxt", label: "Nuxt" },
                              { value: "remix", label: "Remix" },
                            ].find(fw => fw.value === selectedFramework)?.label
                          : t.s63}
                        <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput placeholder={t.s64} />
                        <CommandList>
                          <CommandEmpty>{t.s65}</CommandEmpty>
                          <CommandGroup>
                            {[
                              { value: "react", label: "React" },
                              { value: "vue", label: "Vue" },
                              { value: "angular", label: "Angular" },
                              { value: "svelte", label: "Svelte" },
                              { value: "nextjs", label: "Next.js" },
                              { value: "nuxt", label: "Nuxt" },
                              { value: "remix", label: "Remix" },
                            ].map(framework => (
                              <CommandItem
                                key={framework.value}
                                value={framework.value}
                                onSelect={currentValue => {
                                  setSelectedFramework(
                                    currentValue === selectedFramework
                                      ? ""
                                      : currentValue
                                  );
                                  setOpenCombobox(false);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    selectedFramework === framework.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  }`}
                                />
                                {framework.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedFramework && (
                    <p className="text-sm text-muted-foreground">
                      {t.s61}{" "}
                      {
                        [
                          { value: "react", label: "React" },
                          { value: "vue", label: "Vue" },
                          { value: "angular", label: "Angular" },
                          { value: "svelte", label: "Svelte" },
                          { value: "nextjs", label: "Next.js" },
                          { value: "nuxt", label: "Nuxt" },
                          { value: "remix", label: "Remix" },
                        ].find(fw => fw.value === selectedFramework)?.label
                      }
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="month" className="text-sm font-medium">
                        {t.s66}
                      </Label>
                      <Select
                        value={selectedMonth}
                        onValueChange={setSelectedMonth}
                      >
                        <SelectTrigger id="month">
                          <SelectValue placeholder={t.s67} />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(
                            month => (
                              <SelectItem
                                key={month}
                                value={month.toString().padStart(2, "0")}
                              >
                                {month.toString().padStart(2, "0")}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="year" className="text-sm font-medium">
                        {t.s68}
                      </Label>
                      <Select
                        value={selectedYear}
                        onValueChange={setSelectedYear}
                      >
                        <SelectTrigger id="year">
                          <SelectValue placeholder={t.s69} />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: 10 },
                            (_, i) => new Date().getFullYear() - 5 + i
                          ).map(year => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {selectedMonth && selectedYear && (
                    <p className="text-sm text-muted-foreground">
                      {t.s61} {selectedYear}/{selectedMonth}/
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Data Display Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s70}</h3>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <Label>{t.s71}</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{t.s36}</Badge>
                    <Badge variant="secondary">{t.s22}</Badge>
                    <Badge variant="destructive">{t.s14}</Badge>
                    <Badge variant="outline">{t.s37}</Badge>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s72}</Label>
                  <div className="flex gap-4">
                    <Avatar>
                      <AvatarImage src="https://github.com/shadcn.png" />
                      <AvatarFallback>{t.s73}</AvatarFallback>
                    </Avatar>
                    <Avatar>
                      <AvatarFallback>{t.s74}</AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s75}</Label>
                  <Progress value={progress} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setProgress(Math.max(0, progress - 10))}
                    >
                      -10
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setProgress(Math.min(100, progress + 10))}
                    >
                      +10
                    </Button>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s76}</Label>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s77}</Label>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={e => {
                            e.preventDefault();
                            setCurrentPage(Math.max(1, currentPage - 1));
                          }}
                        />
                      </PaginationItem>
                      {[1, 2, 3, 4, 5].map(page => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            isActive={currentPage === page}
                            onClick={e => {
                              e.preventDefault();
                              setCurrentPage(page);
                            }}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={e => {
                            e.preventDefault();
                            setCurrentPage(Math.min(5, currentPage + 1));
                          }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                  <p className="text-sm text-muted-foreground text-center">
                    {t.s78} {currentPage}
                  </p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s79}</Label>
                  <Table>
                    <TableCaption>{t.s80}</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">{t.s81}</TableHead>
                        <TableHead>{t.s82}</TableHead>
                        <TableHead>{t.s83}</TableHead>
                        <TableHead className="text-right">{t.s84}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">{t.s85}</TableCell>
                        <TableCell>{t.s86}</TableCell>
                        <TableCell>{t.s87}</TableCell>
                        <TableCell className="text-right">$250.00</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">{t.s88}</TableCell>
                        <TableCell>{t.s89}</TableCell>
                        <TableCell>{t.s90}</TableCell>
                        <TableCell className="text-right">$150.00</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">{t.s91}</TableCell>
                        <TableCell>{t.s92}</TableCell>
                        <TableCell>{t.s93}</TableCell>
                        <TableCell className="text-right">$350.00</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s94}</Label>
                  <Menubar>
                    <MenubarMenu>
                      <MenubarTrigger>{t.s95}</MenubarTrigger>
                      <MenubarContent>
                        <MenubarItem>{t.s96}</MenubarItem>
                        <MenubarItem>{t.s97}</MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem>{t.s98}</MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem>{t.s99}</MenubarItem>
                      </MenubarContent>
                    </MenubarMenu>
                    <MenubarMenu>
                      <MenubarTrigger>{t.s100}</MenubarTrigger>
                      <MenubarContent>
                        <MenubarItem>{t.s101}</MenubarItem>
                        <MenubarItem>{t.s102}</MenubarItem>
                      </MenubarContent>
                    </MenubarMenu>
                    <MenubarMenu>
                      <MenubarTrigger>{t.s103}</MenubarTrigger>
                      <MenubarContent>
                        <MenubarItem>{t.s104}</MenubarItem>
                        <MenubarItem>{t.s105}</MenubarItem>
                      </MenubarContent>
                    </MenubarMenu>
                  </Menubar>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s106}</Label>
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink href="/">{t.s107}</BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbLink href="/components">
                          {t.s108}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{t.s106}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Alerts Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s109}</h3>
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t.s110}</AlertTitle>
                <AlertDescription>
                  {t.s111}
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <X className="h-4 w-4" />
                <AlertTitle>{t.s112}</AlertTitle>
                <AlertDescription>
                  {t.s113}
                </AlertDescription>
              </Alert>
            </div>
          </section>

          {/* Tabs Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s114}</h3>
            <Tabs defaultValue="account" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="account">{t.s115}</TabsTrigger>
                <TabsTrigger value="password">{t.s116}</TabsTrigger>
                <TabsTrigger value="settings">{t.s117}</TabsTrigger>
              </TabsList>
              <TabsContent value="account">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.s115}</CardTitle>
                    <CardDescription>
                      {t.s118}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="name">{t.s119}</Label>
                      <Input id="name" defaultValue="Pedro Duarte" />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button>{t.s120}</Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              <TabsContent value="password">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.s116}</CardTitle>
                    <CardDescription>
                      {t.s121}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="current">{t.s122}</Label>
                      <Input id="current" type="password" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new">{t.s123}</Label>
                      <Input id="new" type="password" />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button>{t.s124}</Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              <TabsContent value="settings">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.s117}</CardTitle>
                    <CardDescription>
                      {t.s125}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {t.s126}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>

          {/* Accordion Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s127}</h3>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>{t.s128}</AccordionTrigger>
                <AccordionContent>
                  {t.s129}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>{t.s130}</AccordionTrigger>
                <AccordionContent>
                  {t.s131}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>{t.s132}</AccordionTrigger>
                <AccordionContent>
                  {t.s133}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>

          {/* Collapsible Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s134}</h3>
            <Collapsible>
              <Card>
                <CardHeader>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      <CardTitle>{t.s135}</CardTitle>
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="rounded-md border px-4 py-3 font-mono text-sm">
                        {t.s136}
                      </div>
                      <div className="rounded-md border px-4 py-3 font-mono text-sm">
                        {t.s137}
                      </div>
                      <div className="rounded-md border px-4 py-3 font-mono text-sm">
                        {t.s138}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </section>

          {/* Dialog, Sheet, Drawer Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s139}</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4">
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">{t.s140}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t.s141}</DialogTitle>
                        <DialogDescription>
                          {t.s142}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="dialog-input">{t.s143}</Label>
                          <Input
                            id="dialog-input"
                            placeholder={t.s144}
                            value={dialogInput}
                            onChange={(e) => setDialogInput(e.target.value)}
                            onKeyDown={handleDialogKeyDown}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setDialogOpen(false)}
                        >
                          {t.s145}
                        </Button>
                        <Button onClick={handleDialogSubmit}>{t.s146}</Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline">{t.s147}</Button>
                    </SheetTrigger>
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>{t.s148}</SheetTitle>
                        <SheetDescription>
                          {t.s149}
                        </SheetDescription>
                      </SheetHeader>
                    </SheetContent>
                  </Sheet>

                  <Drawer>
                    <DrawerTrigger asChild>
                      <Button variant="outline">{t.s150}</Button>
                    </DrawerTrigger>
                    <DrawerContent>
                      <DrawerHeader>
                        <DrawerTitle>{t.s151}</DrawerTitle>
                        <DrawerDescription>
                          {t.s152}
                        </DrawerDescription>
                      </DrawerHeader>
                      <DrawerFooter>
                        <Button>{t.s146}</Button>
                        <DrawerClose asChild>
                          <Button variant="outline">{t.s145}</Button>
                        </DrawerClose>
                      </DrawerFooter>
                    </DrawerContent>
                  </Drawer>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">{t.s153}</Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <div className="space-y-2">
                        <h4 className="font-medium leading-none">{t.s154}</h4>
                        <p className="text-sm text-muted-foreground">
                          {t.s155}
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline">{t.s156}</Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t.s157}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Menus Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s158}</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">{t.s159}</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>{t.s160}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>{t.s161}</DropdownMenuItem>
                      <DropdownMenuItem>{t.s162}</DropdownMenuItem>
                      <DropdownMenuItem>{t.s163}</DropdownMenuItem>
                      <DropdownMenuItem>{t.s164}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <Button variant="outline">{t.s165}</Button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem>{t.s161}</ContextMenuItem>
                      <ContextMenuItem>{t.s162}</ContextMenuItem>
                      <ContextMenuItem>{t.s163}</ContextMenuItem>
                      <ContextMenuItem>{t.s164}</ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>

                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Button variant="outline">{t.s166}</Button>
                    </HoverCardTrigger>
                    <HoverCardContent>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">{t.s167}</h4>
                        <p className="text-sm">
                          {t.s168}
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Calendar Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s169}</h3>
            <Card>
              <CardContent className="pt-6 flex justify-center">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="rounded-md border"
                />
              </CardContent>
            </Card>
          </section>

          {/* Carousel Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s170}</h3>
            <Card>
              <CardContent className="pt-6">
                <Carousel className="w-full max-w-xs mx-auto">
                  <CarouselContent>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <CarouselItem key={index}>
                        <div className="p-1">
                          <Card>
                            <CardContent className="flex aspect-square items-center justify-center p-6">
                              <span className="text-4xl font-semibold">
                                {index + 1}
                              </span>
                            </CardContent>
                          </Card>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              </CardContent>
            </Card>
          </section>

          {/* Toggle Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s171}</h3>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>{t.s171}</Label>
                  <div className="flex gap-2">
                    <Toggle aria-label={t.s172}>
                      <span className="font-bold">B</span>
                    </Toggle>
                    <Toggle aria-label={t.s172}>
                      <span className="italic">I</span>
                    </Toggle>
                    <Toggle aria-label={t.s173}>
                      <span className="underline">U</span>
                    </Toggle>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s174}</Label>
                  <ToggleGroup type="multiple">
                    <ToggleGroupItem value="bold" aria-label={t.s175}>
                      <span className="font-bold">B</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="italic" aria-label={t.s172}>
                      <span className="italic">I</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="underline"
                      aria-label={t.s173}
                    >
                      <span className="underline">U</span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Aspect Ratio & Scroll Area Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s176}</h3>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                  <Label>{t.s177}</Label>
                  <AspectRatio ratio={16 / 9} className="bg-muted">
                    <div className="flex h-full items-center justify-center">
                      <p className="text-muted-foreground">{t.s178}</p>
                    </div>
                  </AspectRatio>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t.s179}</Label>
                  <ScrollArea className="h-[200px] w-full rounded-md border overflow-hidden">
                    <div className="p-4">
                      <div className="space-y-4">
                        {Array.from({ length: 20 }).map((_, i) => (
                          <div key={i} className="text-sm">
                            {t.s180} {i + 1}{t.s181}
                          </div>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Resizable Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s182}</h3>
            <Card>
              <CardContent className="pt-6">
                <ResizablePanelGroup
                  direction="horizontal"
                  className="min-h-[200px] rounded-lg border"
                >
                  <ResizablePanel defaultSize={50}>
                    <div className="flex h-full items-center justify-center p-6">
                      <span className="font-semibold">{t.s183}</span>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={50}>
                    <div className="flex h-full items-center justify-center p-6">
                      <span className="font-semibold">{t.s184}</span>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </CardContent>
            </Card>
          </section>

          {/* Toast Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s185}</h3>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>{t.s186}</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        sonnerToast.success(t.s187, {
                          description: t.s188,
                        });
                      }}
                    >
                      {t.s189}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        sonnerToast.error(t.s190, {
                          description:
                            t.s191,
                        });
                      }}
                    >
                      {t.s112}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        sonnerToast.info("Information", {
                          description: t.s192,
                        });
                      }}
                    >
                      {t.s193}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        sonnerToast.warning("Warning", {
                          description:
                            t.s194,
                        });
                      }}
                    >
                      {t.s195}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        sonnerToast.loading("Loading", {
                          description: t.s196,
                        });
                      }}
                    >
                      {t.s197}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const promise = new Promise(resolve =>
                          setTimeout(resolve, 2000)
                        );
                        sonnerToast.promise(promise, {
                          loading: "Processing...",
                          success: t.s198,
                          error: t.s199,
                        });
                      }}
                    >
                      {t.s200}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* AI ChatBox Section */}
          <section className="space-y-4">
            <h3 className="text-2xl font-semibold">{t.s201}</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    <p>
                      {t.s202}
                    </p>
                    <p className="mt-2">
                      {t.s203}
                    </p>
                  </div>
                  <AIChatBox
                    messages={chatMessages}
                    onSendMessage={handleChatSend}
                    isLoading={isChatLoading}
                    placeholder={t.s204}
                    height="500px"
                    emptyStateMessage="How can I help you today?"
                    suggestedPrompts={[
                      t.s205,
                      t.s206,
                      t.s207,
                      t.s208,
                    ]}
                  />
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <footer className="border-t py-6 mt-12">
        <div className="container text-center text-sm text-muted-foreground">
          <p>{t.s209}</p>
        </div>
      </footer>
    </div>
  );
}
