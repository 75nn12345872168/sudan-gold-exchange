import { HelpCircle, BookOpenCheck } from "lucide-react";

export const GOLD_FAQS = [
  {
    question: "كيف يتم حساب سعر الذهب اليوم في السودان على المنصة؟",
    answer:
      "يتم حساب سعر جرام الذهب عيار 24 بقسمة سعر الأونصة العالمي بالدولار على 31.1035 ثم ضرب الناتج في سعر الدولار الموازي المعتمد في السوق السوداني، وبعدها تُشتق أسعار عيار 22 (× 0.9167) وعيار 21 (× 0.875) وعيار 18 (× 0.75) والجنيه الذهب (8 جرام عيار 21).",
  },
  {
    question: "ما الفرق بين السعر الفعلي (الموازي) والسعر الرسمي المعادل؟",
    answer:
      "يعتمد تسعير الصاغة الفعلي في الخرطوم وبورتسودان وعطبرة وولايات السودان على سعر الصرف في السوق الموازي لتكلفة الاستيراد والتحوط، بينما يُعرض السعر الرسمي المعادل للمقارنة والتقديرات المصرفية.",
  },
  {
    question: "كم يبلغ نصاب زكاة الذهب بالجنيه السوداني؟",
    answer:
      "نصاب زكاة الذهب الشرعي هو 85 جراماً من الذهب الخالص (عيار 24)، أو ما يعادله من الأعيرة الأخرى (مثل نحو 97.14 جرام من عيار 21)، وتُخرج الزكاة بنسبة 2.5% عند بلوغ النصاب وحولان الحول الهجري.",
  },
  {
    question: "كم وزن الجنيه الذهب في السودان؟",
    answer:
      "يزن الجنيه الذهب القياسي 8 جرامات من الذهب عيار 21، ويُعد من أكثر أشكال الادخار شيوعاً لدى المواطنين لسهولة تسييله وانخفاض مصنعيته مقارنة بالمشغولات.",
  },
];

export function MarketFaqAndMethodology() {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5">
        <div className="flex items-center gap-2.5 text-slate-900">
          <BookOpenCheck className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-bold">منهجية التسعير والأتمتة</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          تجمع المنصة بين السعر الفوري العالمي للأونصة (
          <span className="font-mono font-semibold text-slate-800">XAU/USD</span>
          ) من عدة مصادر دولية احتياطية، مع أحدث قراءة ميدانية لسعر صرف الدولار
          في السودان ومصنعية الصاغة، وتنشر تحديثات دورية 3 مرات يومياً على قناة
          تيليجرام.
        </p>

        <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 font-mono text-xs text-slate-700" dir="ltr">
          <div>karat_24 = (ounce_usd / 31.1035) * usd_sdg</div>
          <div>karat_22 = karat_24 * 0.9167</div>
          <div>karat_21 = karat_24 * 0.875</div>
          <div>karat_18 = karat_24 * 0.75</div>
          <div>gold_pound = karat_21 * 8</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7">
        <div className="mb-4 flex items-center gap-2.5 text-slate-900">
          <HelpCircle className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-bold">أسئلة شائعة حول سوق الذهب في السودان</h2>
        </div>

        <div className="space-y-3">
          {GOLD_FAQS.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 open:bg-amber-50/40"
            >
              <summary className="cursor-pointer list-none text-sm font-bold text-slate-900">
                {faq.question}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
