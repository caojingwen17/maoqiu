const assert = require('assert');
const core = require('../modules/diaryCore.js');
const prompt = require('../modules/diaryPrompt.js');
const provider = require('../modules/diaryProvider.js');

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name); console.log('    ', e.message); }
}

console.log('宠物日记规则单测：');
test('Asia/Shanghai 日期边界', () => {
  assert.strictEqual(core.dateKey(Date.UTC(2026, 7, 16, 15, 59)), '2026-08-16');
  assert.strictEqual(core.dateKey(Date.UTC(2026, 7, 16, 16, 0)), '2026-08-17');
});
test('生成目标日期为前一天', () => {
  assert.strictEqual(core.shiftDate('2026-03-01', -1), '2026-02-28');
  assert.deepStrictEqual(core.localBounds('2026-08-17'), { start: Date.UTC(2026, 7, 16, 16), end: Date.UTC(2026, 7, 17, 16) });
});
test('输入只保留必要宠物资料和事件摘要', () => {
  const input = core.inputFor({ name: '团团', species: 'dog', traits: ['粘人', '爱玩', '过多'], ownerTitle: '妈妈' }, '2026-08-16', { events: [{ type: '日常', summary: '散步', time: '18:00' }] });
  assert.deepStrictEqual(input.pet.traits, ['粘人', '爱玩', '过多']);
  assert.strictEqual(input.pet.ownerTitle, '妈妈');
  assert.strictEqual(input.noEventDay, false);
  assert.strictEqual(input.events.length, 1);
});
test('事件携带实际执行者称呼', () => {
  const input = core.inputFor({ name: '团团' }, '2026-08-16', {
    ownerTitle: '妈妈',
    events: [{ type: '日常', summary: '散步', time: '18:00', actor: '妈妈' }]
  });
  assert.strictEqual(input.pet.ownerTitle, '妈妈');
  assert.strictEqual(input.events[0].actor, '妈妈');
});
test('无事件日也保留宠物所属成员的家庭称呼', () => {
  const input = core.inputFor({ name: '团团' }, '2026-08-16', {
    ownerTitle: '妈妈',
    events: []
  });
  assert.strictEqual(input.pet.ownerTitle, '妈妈');
  assert.strictEqual(input.noEventDay, true);
});
test('自定义家庭称呼原样使用，未填时用主人', () => {
  const custom = core.inputFor({ name: '团团', ownerTitle: '铲屎官' }, '2026-08-16', { events: [] });
  assert.strictEqual(custom.pet.ownerTitle, '铲屎官');
  const empty = core.inputFor({ name: '团团', ownerTitle: '  ' }, '2026-08-16', { events: [] });
  assert.strictEqual(empty.pet.ownerTitle, '主人');
});
test('输入携带近期标题与随机注意力种子', () => {
  const input = core.inputFor({ name: '团团' }, '2026-08-16', {
    events: [],
    recentTitles: ['发呆的一天', '嗷'],
    focusSeed: '鼻子和闻到的味道'
  });
  assert.deepStrictEqual(input.recentTitles, ['发呆的一天', '嗷']);
  assert.strictEqual(input.focusSeed, '鼻子和闻到的味道');
  const def = core.inputFor({ name: '团团' }, '2026-08-16', { events: [] });
  assert.deepStrictEqual(def.recentTitles, []);
  assert.strictEqual(def.focusSeed, '');
});
test('事件摘要移除联系方式和链接', () => {
  const item = core.summarizeRecord({ type: 'daily', note: '主人电话 13800138000，参考 https://example.com' });
  assert.strictEqual(item.summary.indexOf('13800138000'), -1);
  assert.strictEqual(item.summary.indexOf('https://'), -1);
});
test('提示词版本与输出协议存在', () => {
  assert.strictEqual(prompt.PROMPT_VERSION, 'diaryPromptV12');
  assert.ok(prompt.SYSTEM_PROMPT.indexOf('不得编造') > -1);
  assert.ok(prompt.SYSTEM_PROMPT.indexOf('禁止使用第二人称') > -1);
  assert.ok(prompt.SYSTEM_PROMPT.indexOf('隐性的写作控制') > -1);
  assert.ok(prompt.SYSTEM_PROMPT.indexOf('天马行空') > -1);
  assert.ok(prompt.SYSTEM_PROMPT.indexOf('不要按时间顺序') > -1);
  assert.ok(prompt.SYSTEM_PROMPT.indexOf('让我觉得') > -1);
  assert.ok(prompt.SYSTEM_PROMPT.indexOf('不能扩写成') > -1);
  assert.ok(prompt.buildUserPrompt({ date: '2026-08-16' }, false).indexOf('2026-08-16') > -1);
});
test('模型输出校验拦截越界内容', () => {
  const good = provider.validDiary({ title: '等主人回家', content: '我今天安安静静地趴在窗边，听见主人回来的脚步，耳朵就先开心地动了起来。主人把手放到我的脑袋上，我赶紧往前挪了一点。其实我没有什么大事情，只是喜欢靠近家人，陪大家慢慢过完一天。' });
  assert.ok(good);
  assert.strictEqual(provider.validDiary({ title: '想你了', content: '我今天一直在门边等你回来，想到你的声音就觉得安心。' + '我会继续乖乖守着家，等你回来的时候再把尾巴摇起来。' }), false);
  assert.strictEqual(provider.validDiary({ title: '太短', content: '我想你。' }), false);
  assert.strictEqual(provider.validDiary({ title: '不该出现', content: '我知道模型和数据库会记录一切，这让我很不舒服。' }), false);
  assert.strictEqual(provider.validDiary({ title: '性格宣言', content: '我今天是个吃货，毕竟我是个吃货，所以看到什么都想吃。' + '我很安静地等着主人回家，屋子里一直很温柔。' }), false);
  assert.strictEqual(provider.validDiary({ title: '时光很温柔', content: '我今天趴在门口，听见主人回来的脚步就抬起头。时光慢慢流淌，灯都变暖了。' + '我想靠近主人一点，再靠近一点。' }), false);
  assert.strictEqual(provider.validDiary({ title: "安静的等待", content: "今天家里静悄悄的。我趴在软垫上，眼皮有点重。没有零食的声音，我就乖乖等着主人回来。我心里暖暖的，安安静静地陪着这份宁静，我知道主人一定会爱我的。" }), false);
  assert.strictEqual(provider.validDiary({ title: '今天打针', content: '妈妈摸摸我的头，让我觉得心里很踏实。虽然针有点疼，但是我没有乱动。' + '回家以后我就趴在沙发边，陪妈妈忙了一会儿。' }), false);
});
test('第二人称按家庭称呼归一化', () => {
  const normalized = provider.normalizeDiaryAddress({ title: '想你了', content: '我等你回家，也谢谢你陪着我。' }, { pet: { ownerTitle: '妈妈' } });
  assert.strictEqual(normalized.title, '想妈妈了');
  assert.strictEqual(normalized.content, '我等妈妈回家，也谢谢妈妈陪着我。');
  const custom = provider.normalizeDiaryAddress({ title: '想你了', content: '我等你回家。' }, { pet: { ownerTitle: '铲屎官' } });
  assert.strictEqual(custom.content, '我等铲屎官回家。');
  const fallback = provider.normalizeDiaryAddress({ title: '想你了', content: '我等你回家。' }, { pet: {} });
  assert.strictEqual(fallback.content, '我等主人回家。');
});
test('Responses 返回可提取 assistant JSON', () => {
  const content = provider.extractContent({
    output: [
      { type: 'reasoning', summary: [{ type: 'summary_text', text: '略' }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '这里是结果：{"title":"回家","content":"正文"}' }] }
    ]
  });
  assert.strictEqual(provider.parseJson(content).title, '回家');
});

console.log('\n结果: %d 通过, %d 失败', pass, fail);
if (fail) process.exitCode = 1;
