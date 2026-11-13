import { AppState, MistakeItem, Student } from "../types";
import sampleMathPaperImg from "../assets/images/sample_math_paper_1794562316307.jpg";
import sampleEnglishPaperImg from "../assets/images/sample_english_paper_1794562316343.jpg";

export const SAMPLE_MATH_PAPER_URL = sampleMathPaperImg;
export const SAMPLE_ENGLISH_PAPER_URL = sampleEnglishPaperImg;

export const PRESET_STUDENTS: Student[] = [
  {
    id: "stu-lin",
    name: "林知夏",
    grade: "八年级",
    className: "八年级(3)班",
    note: "重点巩固二次函数与几何辅助线规范作答",
    createdAt: "2026-10-12",
  },
  {
    id: "stu-chen",
    name: "陈子墨",
    grade: "高一",
    className: "高一(1)班",
    note: "强化物理受力分析步骤与英语衡水体卷面书写",
    createdAt: "2026-10-18",
  },
  {
    id: "stu-su",
    name: "苏念安",
    grade: "六年级",
    className: "六年级(2)班",
    note: "规范古诗文默写楷书字形与分数应用题答题格式",
    createdAt: "2026-10-25",
  },
];

export const PRESET_MISTAKES: MistakeItem[] = [
  {
    id: "m-101",
    studentId: "stu-lin",
    subject: "数学",
    questionType: "解答题",
    knowledgePoint: "二次函数顶点与交点",
    questionText:
      "已知二次函数 y = x² - 4x + 3。\n(1) 求该函数图象的顶点坐标及对称轴；\n(2) 求该函数图象与 x 轴、y 轴的交点坐标；\n(3) 当 x 取何值时，y ≤ 0？",
    studentWrongAnswer:
      "顶点写成了 (2, 1)，解不等式时漏掉了端点等号，写成 1 < x < 3。",
    errorReason: "配方符号出错 · 边界等号遗漏",
    standardAnswer:
      "(1) 顶点坐标为 (2, -1)，对称轴为直线 x = 2；\n(2) 与 x 轴交点为 (1, 0)、(3, 0)，与 y 轴交点为 (0, 3)；\n(3) 当 1 ≤ x ≤ 3 时，y ≤ 0。",
    correctionSteps:
      "1. 配方时注意常数项：x² - 4x + 3 = (x - 2)² - 4 + 3 = (x - 2)² - 1；\n2. 不等式 y ≤ 0 包含 y = 0 的两个零点，结合开口向上的抛物线图象，取值范围必须带等号。",
    handwritingTemplate: `解：(1) y = x² - 4x + 3 = (x - 2)² - 1
    ∴ 抛物线的顶点坐标为 (2, -1)，对称轴为直线 x = 2。

(2) 令 y = 0，得 x² - 4x + 3 = 0
    因式分解得 (x - 1)(x - 3) = 0
    解得 x₁ = 1，x₂ = 3
    ∴ 与 x 轴的交点坐标为 (1, 0) 和 (3, 0)。
    令 x = 0，得 y = 3
    ∴ 与 y 轴的交点坐标为 (0, 3)。

(3) 由函数图象开口向上可知：
    当 1 ≤ x ≤ 3 时，y ≤ 0。`,
    masteryStatus: "practicing",
    handwritingPracticeCount: 2,
    createdAt: "2026-11-08",
    updatedAt: "2026-11-11",
  },
  {
    id: "m-102",
    studentId: "stu-lin",
    subject: "数学",
    questionType: "证明题",
    knowledgePoint: "全等三角形判定 (SAS)",
    questionText:
      "如图，点 E、F 在 BC 上，BE = CF，AB = DC，∠B = ∠C。求证：∠A = ∠D。",
    studentWrongAnswer: "直接由 BE = CF 推导出 △ABF ≌ △DCE，未先写 BF = CE 的转化过程。",
    errorReason: "步骤跳跃 · 缺少边长等量转化",
    standardAnswer: "先证 BF = CE，再由 SAS 判定 △ABF ≌ △DCE，从而得证 ∠A = ∠D。",
    correctionSteps:
      "几何证明必须因果链完整：由 BE = CF 两边同时加上 EF（或减去公共部分），先得到三角形的对应边 BF = CE，再列举全等三条件。",
    handwritingTemplate: `证明：∵ BE = CF
      ∴ BE + EF = CF + EF，即 BF = CE。
      在 △ABF 和 △DCE 中：
      ⎧ AB = DC （已知）
      ⎨ ∠B = ∠C （已知）
      ⎩ BF = CE （已证）
      ∴ △ABF ≌ △DCE （SAS）
      ∴ ∠A = ∠D （全等三角形的对应角相等）。`,
    masteryStatus: "pending",
    handwritingPracticeCount: 0,
    createdAt: "2026-11-10",
    updatedAt: "2026-11-10",
  },
  {
    id: "m-103",
    studentId: "stu-lin",
    subject: "语文",
    questionType: "名篇名句默写",
    knowledgePoint: "《岳阳楼记》易错字辨析",
    questionText:
      "补写出下列句子中的空缺部分：\n(1) 居庙堂之高则忧其民，________________。\n(2) 衔远山，吞长江，浩浩汤汤，________________。",
    studentWrongAnswer: "将“横无际涯”误写为“横无际崖”，“处江湖之远”漏写“之”字。",
    errorReason: "形近字混淆 · 虚词漏写",
    standardAnswer: "(1) 处江湖之远则忧其君\n(2) 横无际涯",
    correctionSteps:
      "“涯”指水边、边际（三点水旁），与“浩浩汤汤”的水势呼应；“崖”指山崖，不可混淆。",
    handwritingTemplate: `居庙堂之高则忧其民，处江湖之远则忧其君。
衔远山，吞长江，浩浩汤汤，横无际涯；
朝晖夕阴，气象万千，此则岳阳楼之大观也。
不以物喜，不以己悲；先天下之忧而忧，后天下之乐而乐。`,
    masteryStatus: "pending",
    handwritingPracticeCount: 1,
    createdAt: "2026-11-11",
    updatedAt: "2026-11-11",
  },
  {
    id: "m-104",
    studentId: "stu-lin",
    subject: "英语",
    questionType: "句子改错",
    knowledgePoint: "虚拟语气与主谓一致",
    questionText:
      "改正下列句中的两处语法错误并规范抄写：\nIf I has enough time, I will spend more time balance my study and hobbies.",
    studentWrongAnswer: "只改了 has 为 had，忽略了 spend doing sth. 固定搭配。",
    errorReason: "非谓语动词搭配遗漏",
    standardAnswer:
      "If I had enough time, I would spend more time balancing my study and hobbies.",
    correctionSteps:
      "1. 与现在事实相反的虚拟条件句，从句用过去式 had，主句用 would + 动词原形；\n2. spend time (in) doing sth.，故 balance 需变为 balancing。",
    handwritingTemplate: `To live a meaningful life, I must manage my time wisely.
If I had enough time, I would spend more time balancing my study and hobbies.
A well-planned schedule helps me stay focused in class and enjoy reading after school.`,
    masteryStatus: "mastered",
    handwritingPracticeCount: 3,
    createdAt: "2026-11-05",
    updatedAt: "2026-11-12",
  },
  {
    id: "m-201",
    studentId: "stu-chen",
    subject: "物理",
    questionType: "计算题",
    knowledgePoint: "牛顿第二定律与斜面摩擦力",
    questionText:
      "质量 m = 2 kg 的物块置于倾角 θ = 37° 的固定斜面上，物块与斜面间的动摩擦因数 μ = 0.25。求物块由静止释放后沿斜面下滑的加速度大小。（g = 10 m/s²，sin37° = 0.6，cos37° = 0.8）",
    studentWrongAnswer: "计算法向力时误用了 mg sin37°，导致摩擦力算错。",
    errorReason: "正交分解三角函数混淆",
    standardAnswer: "a = 4 m/s²",
    correctionSteps:
      "垂直斜面方向平衡：F_N = mg cosθ；沿斜面方向由牛顿第二定律：mg sinθ - μF_N = ma，代入数值即可。",
    handwritingTemplate: `解：以物块为研究对象，建立沿斜面和垂直斜面的直角坐标系。
(1) 垂直斜面方向受力平衡：
    F_N = mg cos37° = 2 × 10 × 0.8 = 16 N
(2) 滑动摩擦力大小：
    f = μF_N = 0.25 × 16 = 4 N
(3) 沿斜面方向由牛顿第二定律得：
    mg sin37° - f = ma
    2 × 10 × 0.6 - 4 = 2a
    解得：a = 4 m/s²
答：物块沿斜面下滑的加速度大小为 4 m/s²。`,
    masteryStatus: "pending",
    handwritingPracticeCount: 0,
    createdAt: "2026-11-11",
    updatedAt: "2026-11-11",
  },
  {
    id: "m-202",
    studentId: "stu-chen",
    subject: "英语",
    questionType: "书面表达",
    knowledgePoint: "平衡学习与生活主题作文",
    questionText:
      "请根据提示，写一篇不少于120字的英语短文，题目：My Ideal Life（我的理想生活），重点修正时态与从句连贯性。",
    studentWrongAnswer: "原稿中出现 If I has enough time 等主谓错误，且字母间距不均、行末倾斜。",
    errorReason: "语法时态混用 · 卷面书写欠工整",
    standardAnswer: "见规范衡水体/圆体描红范文。",
    correctionSteps:
      "注意条件状语从句“主将从现”或虚拟语气时态统一；保持英文书写字母饱满圆润、基线平齐、词距均匀。",
    handwritingTemplate: `My Ideal Life
To live a meaningful life, I must work hard now and keep a clear goal in mind.
My ideal life is balanced and fulfilling. If I have enough time, I will devote myself to both my studies and meaningful hobbies such as reading and running.
Whenever I face challenges, staying calm and organized helps me overcome difficulties with confidence.`,
    masteryStatus: "practicing",
    handwritingPracticeCount: 2,
    createdAt: "2026-11-12",
    updatedAt: "2026-11-12",
  },
  {
    id: "m-301",
    studentId: "stu-su",
    subject: "语文",
    questionType: "古诗文书写",
    knowledgePoint: "《西江月·夜行黄沙道中》",
    questionText:
      "规范默写辛弃疾《西江月·夜行黄沙道中》下片，并注意“茅店”“溪桥”“见”的古音通假及字形结构。",
    studentWrongAnswer: "“旧时茅店社林边”的“茅”多写了一撇，“忽见”误写为“忽现”。",
    errorReason: "偏旁笔画误写 · 通假字记忆错误",
    standardAnswer: "七八个星天外，两三点雨山前。旧时茅店社林边，路转溪桥忽见。",
    correctionSteps:
      "“茅”为草字头下接“矛”（无撇点误加）；“见”通“现”，在古诗中必须写作“见”。",
    handwritingTemplate: `七八个星天外，两三点雨山前。
旧时茅店社林边，路转溪桥忽见。`,
    masteryStatus: "pending",
    handwritingPracticeCount: 1,
    createdAt: "2026-11-09",
    updatedAt: "2026-11-09",
  },
  {
    id: "m-302",
    studentId: "stu-su",
    subject: "数学",
    questionType: "应用题",
    knowledgePoint: "分数混合运算与单位“1”",
    questionText:
      "一条公路全长 3600 米，第一周修了全长的 1/4，第二周修了余下的 2/5，还剩多少米没有修？",
    studentWrongAnswer: "把“余下的 2/5”直接算成全长的 2/5：3600 × (1 - 1/4 - 2/5)。",
    errorReason: "单位“1”转换错误",
    standardAnswer: "1620 米",
    correctionSteps:
      "第一周修完后，剩余长度变为新的单位“1”，即全长的 (1 - 1/4) = 3/4；第二周修了剩余的 2/5，还剩剩余的 (1 - 2/5) = 3/5。",
    handwritingTemplate: `解：第一周修后剩余：
    3600 × (1 - 1/4) = 2700（米）
    第二周修后剩余：
    2700 × (1 - 2/5) = 1620（米）
答：还剩 1620 米没有修。`,
    masteryStatus: "mastered",
    handwritingPracticeCount: 2,
    createdAt: "2026-11-07",
    updatedAt: "2026-11-10",
  },
];

export const INITIAL_APP_STATE: AppState = {
  students: PRESET_STUDENTS,
  activeStudentId: PRESET_STUDENTS[0].id,
  mistakes: PRESET_MISTAKES,
  examDraft: {
    title: "阶段错题巩固重组训练卷",
    subtitle: "针对性查漏补缺 · 规范书写专项",
    durationMinutes: 45,
    includeImages: true,
    includeAnswerKey: true,
    blankLinesPerQuestion: 5,
    mistakeIds: ["m-101", "m-102", "m-103"],
  },
};
