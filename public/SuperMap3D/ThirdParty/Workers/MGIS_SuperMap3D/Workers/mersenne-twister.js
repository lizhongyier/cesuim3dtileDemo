/**
@license

   Copyright (C) 1997 - 2002, Makoto Matsumoto and Takuji Nishimura,
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions
   are met:

     1. Redistributions of source code must retain the above copyright
        notice, this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright
        notice, this list of conditions and the following disclaimer in the
        documentation and/or other materials provided with the distribution.

     3. The names of its contributors may not be used to endorse or promote
        products derived from this software without specific prior written
        permission.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
   "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
   A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
   CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
   EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
   PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
var _0x3fa45d=_0x2461;function _0x2461(_0x6f52f,_0x3398d2){var _0x5b2931=_0x5b29();return _0x2461=function(_0x246105,_0x43e6eb){_0x246105=_0x246105-0x1a8;var _0x142d3f=_0x5b2931[_0x246105];return _0x142d3f;},_0x2461(_0x6f52f,_0x3398d2);}(function(_0x22f25b,_0x3a7ff0){var _0x1f266c=_0x2461,_0x57facc=_0x22f25b();while(!![]){try{var _0x4263c7=parseInt(_0x1f266c(0x1ae))/0x1+parseInt(_0x1f266c(0x1b6))/0x2*(-parseInt(_0x1f266c(0x1af))/0x3)+-parseInt(_0x1f266c(0x1aa))/0x4+-parseInt(_0x1f266c(0x1b5))/0x5*(parseInt(_0x1f266c(0x1ab))/0x6)+-parseInt(_0x1f266c(0x1b2))/0x7+parseInt(_0x1f266c(0x1b3))/0x8+parseInt(_0x1f266c(0x1b1))/0x9;if(_0x4263c7===_0x3a7ff0)break;else _0x57facc['push'](_0x57facc['shift']());}catch(_0x1f9b0d){_0x57facc['push'](_0x57facc['shift']());}}}(_0x5b29,0xacba1));var MersenneTwister=function(_0x1c61a2){var _0x555220=_0x2461;_0x1c61a2==undefined&&(_0x1c61a2=new Date()[_0x555220(0x1a8)]()),this['N']=0x270,this['M']=0x18d,this[_0x555220(0x1b4)]=0x9908b0df,this[_0x555220(0x1b0)]=0x80000000,this[_0x555220(0x1b7)]=0x7fffffff,this['mt']=new Array(this['N']),this[_0x555220(0x1ad)]=this['N']+0x1,this['init_genrand'](_0x1c61a2);};MersenneTwister[_0x3fa45d(0x1b8)][_0x3fa45d(0x1ac)]=function(_0x22c07f){var _0xa658b2=_0x3fa45d;this['mt'][0x0]=_0x22c07f>>>0x0;for(this[_0xa658b2(0x1ad)]=0x1;this[_0xa658b2(0x1ad)]<this['N'];this[_0xa658b2(0x1ad)]++){var _0x22c07f=this['mt'][this['mti']-0x1]^this['mt'][this[_0xa658b2(0x1ad)]-0x1]>>>0x1e;this['mt'][this[_0xa658b2(0x1ad)]]=(((_0x22c07f&0xffff0000)>>>0x10)*0x6c078965<<0x10)+(_0x22c07f&0xffff)*0x6c078965+this[_0xa658b2(0x1ad)],this['mt'][this['mti']]>>>=0x0;}},MersenneTwister['prototype']['genrand_int32']=function(){var _0x2418cd=_0x3fa45d,_0x31e4bc,_0x79de17=new Array(0x0,this['MATRIX_A']);if(this[_0x2418cd(0x1ad)]>=this['N']){var _0x5bc7f2;if(this[_0x2418cd(0x1ad)]==this['N']+0x1)this[_0x2418cd(0x1ac)](0x1571);for(_0x5bc7f2=0x0;_0x5bc7f2<this['N']-this['M'];_0x5bc7f2++){_0x31e4bc=this['mt'][_0x5bc7f2]&this[_0x2418cd(0x1b0)]|this['mt'][_0x5bc7f2+0x1]&this['LOWER_MASK'],this['mt'][_0x5bc7f2]=this['mt'][_0x5bc7f2+this['M']]^_0x31e4bc>>>0x1^_0x79de17[_0x31e4bc&0x1];}for(;_0x5bc7f2<this['N']-0x1;_0x5bc7f2++){_0x31e4bc=this['mt'][_0x5bc7f2]&this['UPPER_MASK']|this['mt'][_0x5bc7f2+0x1]&this[_0x2418cd(0x1b7)],this['mt'][_0x5bc7f2]=this['mt'][_0x5bc7f2+(this['M']-this['N'])]^_0x31e4bc>>>0x1^_0x79de17[_0x31e4bc&0x1];}_0x31e4bc=this['mt'][this['N']-0x1]&this[_0x2418cd(0x1b0)]|this['mt'][0x0]&this[_0x2418cd(0x1b7)],this['mt'][this['N']-0x1]=this['mt'][this['M']-0x1]^_0x31e4bc>>>0x1^_0x79de17[_0x31e4bc&0x1],this[_0x2418cd(0x1ad)]=0x0;}return _0x31e4bc=this['mt'][this[_0x2418cd(0x1ad)]++],_0x31e4bc^=_0x31e4bc>>>0xb,_0x31e4bc^=_0x31e4bc<<0x7&0x9d2c5680,_0x31e4bc^=_0x31e4bc<<0xf&0xefc60000,_0x31e4bc^=_0x31e4bc>>>0x12,_0x31e4bc>>>0x0;},MersenneTwister[_0x3fa45d(0x1b8)]['random']=function(){var _0x1a0624=_0x3fa45d;return this[_0x1a0624(0x1a9)]()*(0x1/0x100000000);};function _0x5b29(){var _0x3054d8=['LOWER_MASK','prototype','getTime','genrand_int32','1026672PELbMl','66cKZjbm','init_genrand','mti','51108FLfjVO','1674psEJBB','UPPER_MASK','28954260YJhRED','9670185TGVsXn','6263120OFWbyR','MATRIX_A','304490hrHGWJ','3712ebIpig'];_0x5b29=function(){return _0x3054d8;};return _0x5b29();}