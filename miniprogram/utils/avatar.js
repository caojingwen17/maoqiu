/**
 * 头像配色（a1-a4 背景 + paw 染色），按 openid/_id 稳定哈希分配
 * 首页 / 宠物详情 / 家庭成员共用，保证同一实体的头像色一致。
 */

const AV = [
  { av: 'a1', paw: '#B0803B' },
  { av: 'a2', paw: '#6B8F4E' },
  { av: 'a3', paw: '#B85C5C' },
  { av: 'a4', paw: '#4A7FC7' }
];

function pickAv(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV[h % AV.length];
}

module.exports = {
  AV,
  pickAv
};