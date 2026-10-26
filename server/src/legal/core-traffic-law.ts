import { LegalDocument, LegalSection, legalContentHash } from './types'

const roadSafetySource = 'https://flk.npc.gov.cn/detail?id=2c909fdd678bf17901678bf7201d05ff&title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E9%81%93%E8%B7%AF%E4%BA%A4%E9%80%9A%E5%AE%89%E5%85%A8%E6%B3%95'
const civilCodeSource = 'https://tjca.miit.gov.cn/zwgk/zcwj/flfg/art/2020/art_20cf1a2e1b854924b5caa744c8045d1f.html'

const documentsWithoutHash: Array<Omit<LegalDocument, 'sourceHash'>> = [
  {
    id: 'law-road-safety-2021',
    title: '中华人民共和国道路交通安全法',
    authority: '全国人民代表大会常务委员会',
    documentType: '法律',
    jurisdiction: 'CN',
    publishDate: '2021-04-29',
    effectiveFrom: '2021-04-29',
    status: 'active',
    reviewStatus: 'approved',
    sourceUrl: roadSafetySource,
    version: '2021-amendment',
  },
  {
    id: 'law-civil-code-2021',
    title: '中华人民共和国民法典',
    authority: '全国人民代表大会',
    documentType: '法律',
    documentNumber: '中华人民共和国主席令第四十五号',
    jurisdiction: 'CN',
    publishDate: '2020-05-28',
    effectiveFrom: '2021-01-01',
    status: 'active',
    reviewStatus: 'approved',
    sourceUrl: civilCodeSource,
    version: '2021-01-01',
  },
]

const sectionsWithoutHash: Array<Omit<LegalSection, 'id' | 'contentHash'>> = [
  {
    documentId: 'law-road-safety-2021',
    legalRefId: 'cn-road-safety-2021-art-70',
    articleNumber: '第七十条',
    content: '在道路上发生交通事故，车辆驾驶人应当立即停车，保护现场；造成人身伤亡的，车辆驾驶人应当立即抢救受伤人员，并迅速报告执勤的交通警察或者公安机关交通管理部门。因抢救受伤人员变动现场的，应当标明位置。乘车人、过往车辆驾驶人、过往行人应当予以协助。\n在道路上发生交通事故，未造成人身伤亡，当事人对事实及成因无争议的，可以即行撤离现场，恢复交通，自行协商处理损害赔偿事宜；不即行撤离现场的，应当迅速报告执勤的交通警察或者公安机关交通管理部门。\n在道路上发生交通事故，仅造成轻微财产损失，并且基本事实清楚的，当事人应当先撤离现场再进行协商处理。',
    keywords: ['事故现场', '立即停车', '保护现场', '抢救', '报警', '轻微财产损失'],
  },
  {
    documentId: 'law-road-safety-2021',
    legalRefId: 'cn-road-safety-2021-art-73',
    articleNumber: '第七十三条',
    content: '公安机关交通管理部门应当根据交通事故现场勘验、检查、调查情况和有关的检验、鉴定结论，及时制作交通事故认定书，作为处理交通事故的证据。交通事故认定书应当载明交通事故的基本事实、成因和当事人的责任，并送达当事人。',
    keywords: ['交通事故认定书', '事故认定', '证据', '责任'],
  },
  {
    documentId: 'law-road-safety-2021',
    legalRefId: 'cn-road-safety-2021-art-76',
    articleNumber: '第七十六条',
    content: '机动车发生交通事故造成人身伤亡、财产损失的，由保险公司在机动车第三者责任强制保险责任限额范围内予以赔偿；不足的部分，按照下列规定承担赔偿责任：\n（一）机动车之间发生交通事故的，由有过错的一方承担赔偿责任；双方都有过错的，按照各自过错的比例分担责任。\n（二）机动车与非机动车驾驶人、行人之间发生交通事故，非机动车驾驶人、行人没有过错的，由机动车一方承担赔偿责任；有证据证明非机动车驾驶人、行人有过错的，根据过错程度适当减轻机动车一方的赔偿责任；机动车一方没有过错的，承担不超过百分之十的赔偿责任。\n交通事故的损失是由非机动车驾驶人、行人故意碰撞机动车造成的，机动车一方不承担赔偿责任。',
    keywords: ['机动车', '交强险', '责任', '行人', '非机动车', '人身伤亡', '财产损失'],
  },
  {
    documentId: 'law-civil-code-2021',
    legalRefId: 'cn-civil-code-2021-art-1165',
    articleNumber: '第一千一百六十五条',
    content: '行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。\n依照法律规定推定行为人有过错，其不能证明自己没有过错的，应当承担侵权责任。',
    keywords: ['过错责任', '侵权责任', '损害'],
  },
  {
    documentId: 'law-civil-code-2021',
    legalRefId: 'cn-civil-code-2021-art-1179',
    articleNumber: '第一千一百七十九条',
    content: '侵害他人造成人身损害的，应当赔偿医疗费、护理费、交通费、营养费、住院伙食补助费等为治疗和康复支出的合理费用，以及因误工减少的收入。造成残疾的，还应当赔偿辅助器具费和残疾赔偿金；造成死亡的，还应当赔偿丧葬费和死亡赔偿金。',
    keywords: ['人身损害', '医疗费', '护理费', '交通费', '营养费', '误工费', '残疾赔偿金', '死亡赔偿金'],
  },
  {
    documentId: 'law-civil-code-2021',
    legalRefId: 'cn-civil-code-2021-art-1208',
    articleNumber: '第一千二百零八条',
    content: '机动车发生交通事故造成损害的，依照道路交通安全法律和本法的有关规定承担赔偿责任。',
    keywords: ['机动车交通事故', '损害赔偿', '道路交通安全法'],
  },
  {
    documentId: 'law-civil-code-2021',
    legalRefId: 'cn-civil-code-2021-art-1213',
    articleNumber: '第一千二百一十三条',
    content: '机动车发生交通事故造成损害，属于该机动车一方责任的，先由承保机动车强制保险的保险人在强制保险责任限额范围内予以赔偿；不足部分，由承保机动车商业保险的保险人按照保险合同的约定予以赔偿；仍然不足或者没有投保机动车商业保险的，由侵权人赔偿。',
    keywords: ['交强险', '商业保险', '保险责任', '侵权人赔偿', '机动车'],
  },
]

export const coreTrafficLegalDocuments: LegalDocument[] = documentsWithoutHash.map(document => ({
  ...document,
  sourceHash: legalContentHash(
    sectionsWithoutHash
      .filter(section => section.documentId === document.id)
      .map(section => `${section.articleNumber}\n${section.content}`)
      .join('\n\n')
  ),
}))

export const coreTrafficLegalSections: LegalSection[] = sectionsWithoutHash.map((section, index) => ({
  ...section,
  id: `legal-section-${index + 1}`,
  contentHash: legalContentHash(section.content),
}))
