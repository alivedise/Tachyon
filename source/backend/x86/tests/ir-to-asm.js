/* _________________________________________________________________________
 *
 *             Tachyon : A Self-Hosted JavaScript Virtual Machine
 *
 *
 *  This file is part of the Tachyon JavaScript project. Tachyon is
 *  distributed at:
 *  http://github.com/Tachyon-Team/Tachyon
 *
 *
 *  Copyright (c) 2011, Universite de Montreal
 *  All rights reserved.
 *
 *  This software is licensed under the following license (Modified BSD
 *  License):
 *
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are
 *  met:
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above copyright
 *      notice, this list of conditions and the following disclaimer in the
 *      documentation and/or other materials provided with the distribution.
 *    * Neither the name of the Universite de Montreal nor the names of its
 *      contributors may be used to endorse or promote products derived
 *      from this software without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 *  IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 *  TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 *  PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL UNIVERSITE DE
 *  MONTREAL BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 *  PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 *  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 *  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * _________________________________________________________________________
 */

/**
@fileOverview
Unit tests for the ir translation part of the x86 backend.

@author
Maxime Chevalier-Boisvert
*/

/**
Test suite for x86 code generation
*/
tests.x86 = tests.x86 || tests.testSuite();

/**
Test the IR to ASM translation
*/
tests.x86.irToAsm = function ()
{
    // Get the host compilation parameters
    var params = config.hostParams;

    // Get a reference to the backend object
    var backend = config.hostParams.backend;

    // If we are not running under the x86 backend, stop
    if (!(backend instanceof x86.Backend))
        return;

    // Test the execution of a piece of code
    function test(str, retVal, argVals)
    {
        if (argVals === undefined)
            argVals = [];

        // Make a local static environment
        var paramsEnv = params.staticEnv;
        var localEnv = paramsEnv.copy();
        params.staticEnv = localEnv;

        // Parse the source code
        var ast = parse_src_str(str, params);

        // Parse the static definitions
        localEnv.parseUnit(ast);

        // Compile the AST to IR
        var ir = unitToIR(ast, params);
        lowerIRFunc(ir, params);

        //print(ir);
        //print('');

        // Generate the machine code for all sub-functions
        backend.genCode(ir, params);

        // Link the code for all sub-functions
        backend.linkCode(ir, params);

        // Restore the static environment
        params.staticEnv = paramsEnv;

        // Get the test function
        irFunc = ir.getChild('test');

        // If there is no test function, stop here
        if ((irFunc instanceof IRFunction) === false)
            return;

        // Get the address of the default entry point
        var entryAddr = irFunc.codeBlock.getExportAddr('ENTRY_DEFAULT');

        // Parse the argument types
        var argTypes = [];
        for (var i = 0; i < argVals.length; ++i)
        {
            var argVal = argVals[i];

            if (isInt(argVal) === true)
                argTypes.push('int');
            else if (argVal instanceof Array)
                argTypes.push('void*');
            else
                error('unsupported arg: ' + argVal);
        }

        // Allocate a fake context object
        var ctxBlock = allocMemoryBlock(8192, false);
        var ctxAddr = getBlockAddr(ctxBlock, 0);

        // Call the test function
        var ret = callTachyonFFI(
            argTypes,
            'int',
            entryAddr,
            ctxAddr,
            argVals
        );

        // Free the fake context object
        freeMemoryBlock(ctxBlock);

        if (ret !== retVal)
        {
            error(
                'invalid return value for:\n' +
                '\n' +
                irFunc + '\n' +
                '\n' +
                /*
                'with assembly:\n' +
                '\n' +
                code.assembler.toString(true) + '\n' +
                '\n' +
                */
                'got:\n' +
                ret + '\n' +
                'expected:\n' +
                retVal
            );
        }
    }

    // Simple IIR add tests, 1 argument, no spills needed
    test('                                  \
        function test(ctx, v1)              \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg v1 pint";          \
            "tachyon:ret pint";             \
                                            \
            return iir.add(v1, pint(7));    \
        }                                   \
        ',
        10,
        [3]
    );
    test('                                  \
        function test(ctx, v1)              \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg v1 pint";          \
            "tachyon:ret pint";             \
                                            \
            return iir.add(pint(3), v1);    \
        }                                   \
        ',
        6,
        [3]
    );

    // Simple IIR multiplication
    test('                                  \
        function test(ctx, a)               \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg a pint";           \
            "tachyon:ret pint";             \
                                            \
            a *= pint(3);                   \
            return a;                       \
        }                                   \
        ',
        3,
        [1]
    );

    // IIR multiplication by 2, optimizes to left shift
    test('                                  \
        function test(ctx, a)               \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg a pint";           \
            "tachyon:ret pint";             \
                                            \
            return a * pint(2);             \
        }                                   \
        ',
        6,
        [3]
    );

    // Multiple simple IIR operations, 2 arguments, no spills needed
    test('                                  \
        function test(ctx, v1, v2)          \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg v1 pint";          \
            "tachyon:arg v2 pint";          \
            "tachyon:ret pint";             \
                                            \
            var x0 = iir.add(v1, v2);       \
            var x1 = iir.mul(x0, pint(3));  \
            var x2 = iir.sub(x1, pint(2));  \
                                            \
            return x2;                      \
        }                                   \
        ',
        13,
        [2,3]
    );

    // 3 arguments, IIR add
    test('                                  \
        function test(ctx, v1, v2, v3)      \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg v1 pint";          \
            "tachyon:arg v2 pint";          \
            "tachyon:arg v3 pint";          \
            "tachyon:ret pint";             \
                                            \
            var x = iir.add(v1, v2);        \
            var x = iir.add(x, v3);         \
                                            \
            return x;                       \
        }                                   \
        ',
        6,
        [1,2,3]
    );

    // Many arguments, last passed on the stack even in 64-bit
    test('                                      \
        function test(ctx,a1,a2,a3,a4,a5,a6,a7) \
        {                                       \
            "tachyon:cproxy";                   \
            "tachyon:arg ctx rptr";             \
            "tachyon:arg a1 pint";              \
            "tachyon:arg a2 pint";              \
            "tachyon:arg a3 pint";              \
            "tachyon:arg a4 pint";              \
            "tachyon:arg a5 pint";              \
            "tachyon:arg a6 pint";              \
            "tachyon:arg a7 pint";              \
            "tachyon:ret pint";                 \
                                                \
            var x = iir.sub(a6, a7);            \
                                                \
            return x;                           \
        }                                       \
        ',
        6,
        [0,0,0,0,0,9,3]
    );

    // Many IIR operations, several registers needed
    test('                                  \
        function test(ctx, v1, v2, v3)      \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg v1 pint";          \
            "tachyon:arg v2 pint";          \
            "tachyon:arg v3 pint";          \
            "tachyon:ret pint";             \
                                            \
            var x1 = iir.add(v1, pint(1));  \
            var x2 = iir.add(v1, pint(2));  \
            var x3 = iir.add(v1, pint(3));  \
            var x4 = iir.add(v1, pint(4));  \
            var x5 = iir.add(v1, pint(5));  \
            var x6 = iir.add(v1, pint(6));  \
            var x7 = iir.add(v1, pint(7));  \
                                            \
            var y = iir.mul(x1, x2);        \
            var y = iir.mul(y, x3);         \
            var y = iir.mul(y, x4);         \
            var y = iir.mul(y, x5);         \
            var y = iir.mul(y, x6);         \
            var y = iir.mul(y, x7);         \
                                            \
            var z = iir.sub(y, pint(1));    \
                                            \
            return z;                       \
        }                                   \
        ',
        5039,
        [0,1,2]
    );

    // Many IIR operations, spills needed in 32-bit and 64-bit
    test('                                  \
        function test(ctx, v1, v2, v3)      \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg v1 pint";          \
            "tachyon:arg v2 pint";          \
            "tachyon:arg v3 pint";          \
            "tachyon:ret pint";             \
                                            \
            var x01 = v1 * pint(1);         \
            var x02 = v1 * pint(2);         \
            var x03 = v1 * pint(3);         \
            var x04 = v1 * pint(4);         \
            var x05 = v1 * pint(5);         \
            var x06 = v1 * pint(6);         \
            var x07 = v1 * pint(7);         \
            var x08 = v1 * pint(8);         \
            var x09 = v1 * pint(9);         \
            var x10 = v1 * pint(10);        \
            var x11 = v1 * pint(11);        \
            var x12 = v1 * pint(12);        \
            var x13 = v1 * pint(13);        \
            var x14 = v1 * pint(14);        \
            var x15 = v1 * pint(15);        \
            var x16 = v1 * pint(16);        \
            var x17 = v1 * pint(17);        \
            var x18 = v1 * pint(18);        \
                                            \
            var y = x01 + x02;              \
            var y = y + x03;                \
            var y = y + x04;                \
            var y = y + x05;                \
            var y = y + x06;                \
            var y = y + x07;                \
            var y = y + x08;                \
            var y = y + x09;                \
            var y = y + x10;                \
            var y = y + x11;                \
            var y = y + x12;                \
            var y = y + x13;                \
            var y = y + x14;                \
            var y = y + x15;                \
            var y = y + x16;                \
            var y = y + x17;                \
            var y = y + x18;                \
            var z = y - v2 - v3;            \
                                            \
            return z;                       \
        }                                   \
        ',
        166,
        [1,2,3]
    );

    // Variations of arithmetic instructions, spills needed
    test('                                      \
        function test(ctx, v1, v5, v8, v10)     \
        {                                       \
            "tachyon:cproxy";                   \
            "tachyon:arg ctx rptr";             \
            "tachyon:arg v1 pint";              \
            "tachyon:arg v8 pint";              \
            "tachyon:arg v5 pint";              \
            "tachyon:arg v10 pint";             \
            "tachyon:ret pint";                 \
                                                \
            var x01 = v1 * pint(2);             \
            var x02 = pint(2) * v1;             \
            var x03 = v1 + pint(3);             \
            var x04 = pint(4) + v1;             \
            var x05 = v1 + v8;                  \
            var x06 = v8 + v1;                  \
            var x07 = v10 - pint(7);            \
            var x08 = pint(5) - v10;            \
            var x09 = v10 % pint(9);            \
            var x10 = pint(9) % pint(5);        \
            var x11 = v1 * pint(3);             \
            var x12 = pint(3) * v1;             \
            var x13 = v10 / pint(5);            \
            var x14 = v8 / pint(2);             \
            var x15 = v8 * pint(2);             \
            var x16 = v1 * pint(16);            \
            var x17 = v1 * pint(17);            \
            var x18 = v1 * pint(18);            \
                                                \
            var y = x01 + x02;                  \
            var y = y + x03;                    \
            var y = y + x04;                    \
            var y = y + x05;                    \
            var y = y + x06;                    \
            var y = y + x07;                    \
            var y = y + x08;                    \
            var y = y + x09;                    \
            var y = y + x10;                    \
            var y = y + x11;                    \
            var y = y + x12;                    \
            var y = y + x13;                    \
            var y = y + x14;                    \
            var y = y + x15;                    \
            var y = y + x16;                    \
            var y = y + x17;                    \
            var y = y + x18;                    \
                                                \
            return y;                           \
        }                                       \
        ',
        113,
        [1,5,8,10]
    );

    // If statement, return value merge
    test('                                  \
        function test(ctx, v1, v2)          \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg v1 pint";          \
            "tachyon:arg v2 pint";          \
            "tachyon:ret pint";             \
                                            \
            if (v1 !== pint(0))             \
                var y = v2 + pint(1);       \
            else                            \
                var y = v2 - pint(1);       \
                                            \
            return y;                       \
        }                                   \
        ',
        8,
        [1, 7]
    );

    // Comparison test
    test('                                  \
        function test(ctx, v0, v1, v2)      \
        {                                   \
            "tachyon:cproxy";               \
            "tachyon:arg ctx rptr";         \
            "tachyon:arg v0 pint";          \
            "tachyon:arg v1 pint";          \
            "tachyon:arg v2 pint";          \
            "tachyon:ret pint";             \
                                            \
            var sum = pint(0);              \
                                            \
            if (v1 !== pint(0))             \
                sum += pint(1);             \
            if (v2 === pint(0))             \
                sum += pint(555);           \
            if (v0 <= pint(0))              \
                sum += pint(1);             \
            if (v0 >= pint(0))              \
                sum += pint(1);             \
            if (v1 < pint(0))               \
                sum += pint(1);             \
            if (v1 <= pint(0))              \
                sum += pint(1);             \
            if (v1 > pint(0))               \
                sum += pint(555);           \
            if (v2 < pint(0))               \
                sum += pint(555);           \
            if (v2 > pint(0))               \
                sum += pint(1);             \
            if (v1 < pint(1))               \
                sum += pint(1);             \
            if (v1 <= v2)                   \
                sum += pint(1);             \
            if (v1 > v2)                    \
                sum += pint(555);           \
            if (v2 >= v1)                   \
                sum += pint(1);             \
                                            \
            return sum;                     \
        }                                   \
        ',
        9,
        [0, -3, 7]
    );

    // Simple loop, counter incrementation
    test('                                      \
        function test(ctx, v1, v2)              \
        {                                       \
            "tachyon:cproxy";                   \
            "tachyon:arg ctx rptr";             \
            "tachyon:arg v1 pint";              \
            "tachyon:arg v2 pint";              \
            "tachyon:ret pint";                 \
                                                \
            var sum = v2;                       \
                                                \
            for (var i = pint(0); i < v1; ++i)  \
                sum = pint(2) + sum;            \
                                                \
            return sum;                         \
        }                                       \
        ',
        27,
        [10, 7]
    );

    // Loop with nested if statement, modulo operator
    test('                                      \
        function test(ctx, v1, v2)              \
        {                                       \
            "tachyon:cproxy";                   \
            "tachyon:arg ctx rptr";             \
            "tachyon:arg v1 pint";              \
            "tachyon:arg v2 pint";              \
            "tachyon:ret pint";                 \
                                                \
            var sum = v2;                       \
                                                \
            for (var i = pint(0); i < v1; ++i)  \
            {                                   \
                if (i % pint(2) === pint(0))    \
                    sum += i;                   \
            }                                   \
                                                \
            return sum;                         \
        }                                       \
        ',
        22,
        [10, 2]
    );

    // Nested loops with if statement, modulo operator
    test('                                          \
        function test(ctx, v1, v2, v3)              \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v1 pint";                  \
            "tachyon:arg v2 pint";                  \
            "tachyon:arg v3 pint";                  \
            "tachyon:ret pint";                     \
                                                    \
            var sum = v3;                           \
                                                    \
            for (var i = pint(0); i < v1; ++i)      \
            {                                       \
                for (var j = pint(0); j < v2; ++j)  \
                {                                   \
                    if (j % pint(2) === pint(0))    \
                        sum += j;                   \
                }                                   \
            }                                       \
                                                    \
            return sum;                             \
        }                                           \
        ',
        102,
        [5, 10, 2]
    );

    // If statement, spills needed
    test('                                          \
        function test(ctx, v1, v2, v3)              \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v1 pint";                  \
            "tachyon:arg v2 pint";                  \
            "tachyon:arg v3 pint";                  \
            "tachyon:ret pint";                     \
                                                    \
            if (v1 % pint(2) === pint(0))           \
            {                                       \
                var x01 = v2 + pint(1);             \
                var x02 = v2 + pint(2);             \
                var x03 = v2 + pint(3);             \
                var x04 = v2 + pint(4);             \
                var x05 = v2 + pint(5);             \
                var x06 = v2 + pint(6);             \
                var x07 = v2 + pint(7);             \
                var x08 = v2 + pint(8);             \
                var x09 = v2 + pint(9);             \
                var x10 = v2 + pint(10);            \
                var x11 = v2 + pint(11);            \
                var x12 = v2 + pint(12);            \
                var x13 = v2 + pint(13);            \
                var x14 = v2 + pint(14);            \
                var x15 = v2 + pint(15);            \
                var x16 = v2 + pint(16);            \
                var x17 = v2 + pint(17);            \
                var x18 = v2 + pint(18);            \
            }                                       \
            else                                    \
            {                                       \
                var x01 = v1 + pint(1);             \
                var x02 = v1 + pint(2);             \
                var x03 = v1 + pint(3);             \
                var x04 = v1 + pint(4);             \
                var x05 = v1 + pint(5);             \
                var x06 = v1 + pint(6);             \
                var x07 = v1 + pint(7);             \
                var x08 = v1 + pint(8);             \
                var x09 = v1 + pint(9);             \
                var x10 = v1 + pint(10);            \
                var x11 = v1 + pint(11);            \
                var x12 = v1 + pint(12);            \
                var x13 = v1 + pint(13);            \
                var x14 = v1 + pint(14);            \
                var x15 = v1 + pint(15);            \
                var x16 = v1 + pint(16);            \
                var x17 = v1 + pint(17);            \
                var x18 = v1 + pint(18);            \
            }                                       \
                                                    \
            var y = v3;                             \
            var y = y + x01;                        \
            var y = y + x02;                        \
            var y = y + x03;                        \
            var y = y + x04;                        \
            var y = y + x05;                        \
            var y = y + x06;                        \
            var y = y + x07;                        \
            var y = y + x08;                        \
            var y = y + x09;                        \
            var y = y + x10;                        \
            var y = y + x11;                        \
            var y = y + x12;                        \
            var y = y + x13;                        \
            var y = y + x14;                        \
            var y = y + x15;                        \
            var y = y + x16;                        \
            var y = y + x17;                        \
            var y = y + x18;                        \
                                                    \
            return y;                               \
        }                                           \
        ',
        263,
        [5, 10, 2]
    );

    // Nested loops and if, spills needed
    test('                                          \
        function test(ctx, v1, v2, v3)              \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v1 pint";                  \
            "tachyon:arg v2 pint";                  \
            "tachyon:arg v3 pint";                  \
            "tachyon:ret pint";                     \
                                                    \
            var sum = v3;                           \
                                                    \
            for (var i = pint(0); i < v1; ++i)      \
            {                                       \
                for (var j = pint(0); j < v2; ++j)  \
                {                                   \
                    if (j % pint(2) === pint(0))    \
                    {                               \
                        var x01 = j + pint(1);      \
                        var x02 = j + pint(2);      \
                        var x03 = j + pint(3);      \
                        var x04 = j + pint(4);      \
                        var x05 = j + pint(5);      \
                        var x06 = j + pint(6);      \
                        var x07 = j + pint(7);      \
                        var x08 = j + pint(8);      \
                        var x09 = j + pint(9);      \
                        var x10 = j + pint(10);     \
                        var x11 = j + pint(11);     \
                        var x12 = j + pint(12);     \
                        var x13 = j + pint(13);     \
                        var x14 = j + pint(14);     \
                        var x15 = j + pint(15);     \
                        var x16 = j + pint(16);     \
                        var x17 = j + pint(17);     \
                        var x18 = j + pint(18);     \
                    }                               \
                    else                            \
                    {                               \
                        var x01 = v1 + pint(1);     \
                        var x02 = v1 + pint(2);     \
                        var x03 = v1 + pint(3);     \
                        var x04 = v1 + pint(4);     \
                        var x05 = v1 + pint(5);     \
                        var x06 = v1 + pint(6);     \
                        var x07 = v1 + pint(7);     \
                        var x08 = v1 + pint(8);     \
                        var x09 = v1 + pint(9);     \
                        var x10 = v1 + pint(10);    \
                        var x11 = v1 + pint(11);    \
                        var x12 = v1 + pint(12);    \
                        var x13 = v1 + pint(13);    \
                        var x14 = v1 + pint(14);    \
                        var x15 = v1 + pint(15);    \
                        var x16 = v1 + pint(16);    \
                        var x17 = v1 + pint(17);    \
                        var x18 = v1 + pint(18);    \
                    }                               \
                                                    \
                    var y = x01 + x02;              \
                    var y = y + x03;                \
                    var y = y + x04;                \
                    var y = y + x05;                \
                    var y = y + x06;                \
                    var y = y + x07;                \
                    var y = y + x08;                \
                    var y = y + x09;                \
                    var y = y + x10;                \
                    var y = y + x11;                \
                    var y = y + x12;                \
                    var y = y + x13;                \
                    var y = y + x14;                \
                    var y = y + x15;                \
                    var y = y + x16;                \
                    var y = y + x17;                \
                    var y = y + x18;                \
                                                    \
                    sum += y;                       \
                }                                   \
            }                                       \
                                                    \
            return sum;                             \
        }                                           \
        ',
        12602,
        [5, 10, 2]
    );

    // Loop following loop
    test('                                          \
        function test(ctx, v1, v2, v3)              \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v1 pint";                  \
            "tachyon:arg v2 pint";                  \
            "tachyon:arg v3 pint";                  \
            "tachyon:ret pint";                     \
                                                    \
            var sum = v3;                           \
                                                    \
            for (var i = pint(0); i < v1; ++i)      \
            {                                       \
                for (var j = pint(0); j < v2; ++j)  \
                {                                   \
                    if (j % pint(2) === pint(0))    \
                    {                               \
                        var x01 = j + pint(1);      \
                        var x02 = j + pint(2);      \
                        var x03 = j + pint(3);      \
                        var x04 = j + pint(4);      \
                        var x05 = j + pint(5);      \
                        var x06 = j + pint(6);      \
                        var x07 = j + pint(7);      \
                        var x08 = j + pint(8);      \
                        var x09 = j + pint(9);      \
                        var x10 = j + pint(10);     \
                        var x11 = j + pint(11);     \
                        var x12 = j + pint(12);     \
                        var x13 = j + pint(13);     \
                        var x14 = j + pint(14);     \
                        var x15 = j + pint(15);     \
                        var x16 = j + pint(16);     \
                        var x17 = j + pint(17);     \
                        var x18 = j + pint(18);     \
                    }                               \
                    else                            \
                    {                               \
                        var x01 = v1 + pint(1);     \
                        var x02 = v1 + pint(2);     \
                        var x03 = v1 + pint(3);     \
                        var x04 = v1 + pint(4);     \
                        var x05 = v1 + pint(5);     \
                        var x06 = v1 + pint(6);     \
                        var x07 = v1 + pint(7);     \
                        var x08 = v1 + pint(8);     \
                        var x09 = v1 + pint(9);     \
                        var x10 = v1 + pint(10);    \
                        var x11 = v1 + pint(11);    \
                        var x12 = v1 + pint(12);    \
                        var x13 = v1 + pint(13);    \
                        var x14 = v1 + pint(14);    \
                        var x15 = v1 + pint(15);    \
                        var x16 = v1 + pint(16);    \
                        var x17 = v1 + pint(17);    \
                        var x18 = v1 + pint(18);    \
                    }                               \
                                                    \
                    var y = x01 + x02;              \
                    var y = y + x03;                \
                    var y = y + x04;                \
                    var y = y + x05;                \
                    var y = y + x06;                \
                    var y = y + x07;                \
                    var y = y + x08;                \
                    var y = y + x09;                \
                    var y = y + x10;                \
                    var y = y + x11;                \
                    var y = y + x12;                \
                    var y = y + x13;                \
                    var y = y + x14;                \
                    var y = y + x15;                \
                    var y = y + x16;                \
                    var y = y + x17;                \
                    var y = y + x18;                \
                                                    \
                    sum += y;                       \
                }                                   \
            }                                       \
                                                    \
            for (var i = pint(0); i < v1; ++i)      \
            {                                       \
                sum += pint(1);                     \
            }                                       \
                                                    \
            return sum;                             \
        }                                           \
        ',
        12607,
        [5, 10, 2]
    );

    // Integer cast, 16-bit operand add
    test('                                          \
        function test(ctx, v1, v5, v8, v10)         \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v1 pint";                  \
            "tachyon:arg v8 pint";                  \
            "tachyon:arg v5 pint";                  \
            "tachyon:arg v10 pint";                 \
            "tachyon:ret pint";                     \
                                                    \
            var x1 = iir.icast(IRType.i16, v5);     \
            var x2 = iir.icast(IRType.i16, v8);     \
                                                    \
            var y = x1 + x2;                        \
            y = iir.icast(IRType.pint, y);          \
                                                    \
            return y;                               \
        }                                           \
        ',
        13,
        [1,5,8,10]
    );

    // Shift operations test with int32, int8
    test('                                          \
        function test(ctx, v1, v5, v8, v10)         \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v1 pint";                  \
            "tachyon:arg v8 pint";                  \
            "tachyon:arg v5 pint";                  \
            "tachyon:arg v10 pint";                 \
            "tachyon:ret pint";                     \
                                                    \
            var v1_32 = iir.icast(IRType.i32, v1);  \
            var v5_32 = iir.icast(IRType.i32, v5);  \
            var vm5_32 = -v5_32;                    \
            var v1_8 = iir.icast(IRType.i8, v1);    \
            var v5_8 = iir.icast(IRType.i8, v5);    \
                                                    \
            var x1 = v5_32 << v1_32;    /* 10 */    \
            var x2 = v5_32 >> v1_32;    /* 2 */     \
            var x3 = v5_32 >>> v1_32;   /* 2 */     \
            var x4 = vm5_32 >> v1_32;   /* -3 */    \
            var x5 = v5_8 >> v1_8;      /* 2 */     \
            var x6 = v5_8 << i8(8);     /* 0 */     \
                                                    \
            var sum = pint(0);                      \
            sum += iir.icast(IRType.pint, x1);      \
            sum += iir.icast(IRType.pint, x2);      \
            sum += iir.icast(IRType.pint, x3);      \
            sum += iir.icast(IRType.pint, x4);      \
            sum += iir.icast(IRType.pint, x5);      \
            sum += iir.icast(IRType.pint, x6);      \
                                                    \
            return sum;                             \
        }                                           \
        ',
        13,
        [1,5,8,10]
    );

    // Various size operands, spills, if merge
    test('                                          \
        function test(ctx, v1, v5, v8, v10)         \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v1 pint";                  \
            "tachyon:arg v8 pint";                  \
            "tachyon:arg v5 pint";                  \
            "tachyon:arg v10 pint";                 \
            "tachyon:ret pint";                     \
                                                    \
            var v1_16 = iir.icast(IRType.i16, v1);  \
            var v5_16 = iir.icast(IRType.i16, v5);  \
            var v8_16 = iir.icast(IRType.i16, v8);  \
            var v1_8 = iir.icast(IRType.i8, v1);    \
            var v5_8 = iir.icast(IRType.i8, v5);    \
            var v8_8 = iir.icast(IRType.i8, v8);    \
                                                    \
            var x01 = v1_16 + i16(1);               \
            var x02 = v1_16 + i16(2);               \
            var x03 = v1_16 + i16(3);               \
            var x04 = v1_16 + i16(4);               \
            var x05 = v1_16 + i16(5);               \
                                                    \
            if (v5 === pint(4))                     \
            {                                       \
                /* Spills on this side */           \
                var x06 = v1_8 + i8(6);             \
                var x07 = v1_8 + i8(7);             \
                var x08 = v1_8 + i8(8);             \
                var x09 = v1_8 + i8(9);             \
                var x10 = v1_8 + i8(10);            \
                var x11 = v1_8 + i8(11);            \
                var x12 = v1_8 + i8(12);            \
                var x13 = v1_8 + i8(13);            \
                var x14 = v1_8 + i8(14);            \
                var x15 = v1_8 + i8(15);            \
                var x16 = v1_8 + i8(16);            \
                var x17 = v1_8 + i8(17);            \
                var x18 = v1_8 + i8(18);            \
            }                                       \
            else                                    \
            {                                       \
                var x06 = i8(0);                    \
                var x07 = i8(0);                    \
                var x08 = i8(0);                    \
                var x09 = i8(0);                    \
                var x10 = i8(0);                    \
                var x11 = i8(0);                    \
                var x12 = i8(0);                    \
                var x13 = i8(0);                    \
                var x14 = i8(0);                    \
                var x15 = i8(0);                    \
                var x16 = i8(0);                    \
                var x17 = i8(0);                    \
                var x18 = i8(0);                    \
            }                                       \
                                                    \
            var sum = pint(0);                      \
            sum += iir.icast(IRType.pint, x01);     \
            sum += iir.icast(IRType.pint, x02);     \
            sum += iir.icast(IRType.pint, x03);     \
            sum += iir.icast(IRType.pint, x04);     \
            sum += iir.icast(IRType.pint, x05);     \
            sum += iir.icast(IRType.pint, x06);     \
            sum += iir.icast(IRType.pint, x07);     \
            sum += iir.icast(IRType.pint, x08);     \
            sum += iir.icast(IRType.pint, x09);     \
            sum += iir.icast(IRType.pint, x10);     \
            sum += iir.icast(IRType.pint, x11);     \
            sum += iir.icast(IRType.pint, x12);     \
            sum += iir.icast(IRType.pint, x13);     \
            sum += iir.icast(IRType.pint, x14);     \
            sum += iir.icast(IRType.pint, x15);     \
            sum += iir.icast(IRType.pint, x16);     \
            sum += iir.icast(IRType.pint, x17);     \
            sum += iir.icast(IRType.pint, x18);     \
                                                    \
            return sum;                             \
        }                                           \
        ',
        20,
        [1,5,8,10]
    );

    // Bitwise operations, unsigned value
    test('                                          \
        function test(ctx, v3, v5)                  \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v3 pint";                  \
            "tachyon:arg v5 pint";                  \
            "tachyon:ret pint";                     \
                                                    \
            var v5_8 = iir.icast(IRType.u8, v5);    \
            var x1 = ~v5_8;         /* 250 */       \
            var x2 = iir.icast(IRType.pint, x1);    \
                                                    \
            var sum = pint(0);                      \
            sum += v3 & v5;         /* 1 */         \
            sum += v5 & v3;         /* 1 */         \
            sum += v5 & pint(3);    /* 1 */         \
            sum += pint(5) & v3;    /* 1 */         \
            sum += v3 | v5;         /* 7 */         \
            sum += v5 | pint(3);    /* 7 */         \
            sum += v3 ^ v5;         /* 6 */         \
            sum += x2;                              \
                                                    \
            return sum;                             \
        }                                           \
        ',
        274,
        [3,5]
    );

    // Load and store
    var memBlock = allocMemoryBlock(256, false);
    var blockAddr = getBlockAddr(memBlock, 0);
    test('                                          \
        function test(ctx, ptr)                     \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg ptr rptr";                 \
            "tachyon:ret pint";                     \
                                                    \
            iir.store(                              \
                IRType.pint,                        \
                ptr,                                \
                pint(0),                            \
                pint(601)                           \
            );                                      \
                                                    \
            var loadVal = iir.load(                 \
                IRType.i8,                          \
                ptr,                                \
                pint(0)                             \
            );                                      \
                                                    \
            return iir.icast(IRType.pint, loadVal); \
        }                                           \
        ',
        89,
        [blockAddr]
    );

    // Arithmetic instructions with overflow handling
    test('                                          \
        function test(ctx, v3, v5)                  \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v3 pint";                  \
            "tachyon:arg v5 pint";                  \
            "tachyon:ret pint";                     \
                                                    \
            var sum = pint(0);                      \
                                                    \
            var x1;                                 \
            if (x1 = iir.add_ovf(v3, v5))           \
                sum += x1;                          \
            else                                    \
                sum += pint(555);                   \
                                                    \
            return sum;                             \
        }                                           \
        ',
        8,
        [3,5]
    );

    // Boxed integer add
    test('                                          \
        function test(ctx, v3, v5, v8)              \
        {                                           \
            "tachyon:cproxy";                       \
            "tachyon:arg ctx rptr";                 \
            "tachyon:arg v3 pint";                  \
            "tachyon:arg v5 pint";                  \
            "tachyon:ret pint";                     \
                                                    \
            v3 = boxInt(v3);                        \
            v5 = boxInt(v5);                        \
            var r = iir.add(v3, v5);                \
            r = unboxInt(r);                        \
                                                    \
            return r;                               \
        }                                           \
        ',
        8,
        [3,5]
    );

    // Simple C function call test, no arguments
    test('                                              \
        function test(ctx, n)                           \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            return iir.call_ffi(callee);                \
        }                                               \
        function callee()                               \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:static";                           \
            "tachyon:ret pint";                         \
                                                        \
            return pint(7);                             \
        }                                               \
        ',
        7,
        [10]
    );

    // Simple C function call test, one argument
    test('                                              \
        function test(ctx, n)                           \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            return iir.call_ffi(callee, n);             \
        }                                               \
        function callee(n)                              \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:static";                           \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            return n + pint(3);                         \
        }                                               \
        ',
        12,
        [9]
    );

    // Fibonacci test (C function)
    test('                                              \
        function test(ctx, n)                           \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            return iir.call_ffi(fib, n);                \
        }                                               \
        function fib(n)                                 \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:static";                           \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            if (n < pint(2))                            \
                return n;                               \
                                                        \
            var fnm1 = iir.call_ffi(fib, n - pint(1));  \
            var fnm2 = iir.call_ffi(fib, n - pint(2));  \
            return fnm1 + fnm2;                         \
        }                                               \
        ',
        55,
        [10]
    );

    // Multiple argument test (C function)
    test('                                              \
        function test(ctx, a1, a2, a3)                  \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg a1 pint";                      \
            "tachyon:arg a2 pint";                      \
            "tachyon:arg a3 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            return iir.call_ffi(callee, a1, a2, a3);    \
        }                                               \
        function callee(a1, a2, a3)                     \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:static";                           \
            "tachyon:arg a1 pint";                      \
            "tachyon:arg a2 pint";                      \
            "tachyon:arg a3 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            return (a1 - a2) * a3;                      \
        }                                               \
        ',
        15,
        [9, 4, 3]
    );

    // One argument test (Tachyon function)
    test('                                              \
        function test(ctx, a1)                          \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg a1 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            iir.set_ctx(ctx);                           \
            return callee(a1);                          \
        }                                               \
        function callee(a1)                             \
        {                                               \
            "tachyon:static";                           \
            "tachyon:arg a1 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            return a1 + pint(1);                        \
        }                                               \
        ',
        10,
        [9]
    );

    // Multiple argument test (Tachyon function)
    test('                                              \
        function test(ctx, a1, a2, a3)                  \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg a1 pint";                      \
            "tachyon:arg a2 pint";                      \
            "tachyon:arg a3 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            iir.set_ctx(ctx);                           \
            return callee(a1, a2, a3);                  \
        }                                               \
        function callee(a1, a2, a3)                     \
        {                                               \
            "tachyon:static";                           \
            "tachyon:arg a1 pint";                      \
            "tachyon:arg a2 pint";                      \
            "tachyon:arg a3 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            return (a1 - a2) * a3;                      \
        }                                               \
        ',
        15,
        [9, 4, 3]
    );

    // C FFI function call
    test('                                              \
        function test(ctx, a1, a2)                      \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg a1 pint";                      \
            "tachyon:arg a2 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            return iir.call_ffi(ffi_sum2Ints, a1, a2);  \
        }                                               \
        ',
        18,
        [3, 15]
    );

    // Tachyon function calling C function
    test('                                              \
        function test(ctx, a1, a2, a3)                  \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg a1 pint";                      \
            "tachyon:arg a2 pint";                      \
            "tachyon:arg a3 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            iir.set_ctx(ctx);                           \
            return callee(a1, a2, a3);                  \
        }                                               \
        function callee(a1, a2, a3)                     \
        {                                               \
            "tachyon:static";                           \
            "tachyon:arg a1 pint";                      \
            "tachyon:arg a2 pint";                      \
            "tachyon:arg a3 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            var s = iir.call_ffi(ffi_sum2Ints, a1, a2); \
            return s * a3;                              \
        }                                               \
        ',
        12,
        [1, 2, 4]
    );

    // Spills in caller, callee (Tachyon function)
    test('                                              \
        function test(ctx, v0, v1, v5, v8)              \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg v0 pint";                      \
            "tachyon:arg v1 pint";                      \
            "tachyon:arg v5 pint";                      \
            "tachyon:arg v8 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            var x01 = v1 + pint(1);                     \
            var x02 = v1 + pint(2);                     \
            var x03 = v1 + pint(3);                     \
            var x04 = v1 + pint(4);                     \
            var x05 = v1 + pint(5);                     \
            var x06 = v1 + pint(6);                     \
            var x07 = v1 + pint(7);                     \
            var x08 = v1 + pint(8);                     \
            var x09 = v1 + pint(9);                     \
            var x10 = v1 + pint(10);                    \
            var x11 = v1 + pint(11);                    \
            var x12 = v1 + pint(12);                    \
            var x13 = v1 + pint(13);                    \
            var x14 = v1 + pint(14);                    \
            var x15 = v1 + pint(15);                    \
            var x16 = v1 + pint(16);                    \
            var x17 = v1 + pint(17);                    \
                                                        \
            var s = pint(0);                            \
            s += x01;                                   \
            s += x02;                                   \
            s += x03;                                   \
            s += x04;                                   \
            s += x05;                                   \
            s += x06;                                   \
            s += x07;                                   \
            s += x08;                                   \
            s += x09;                                   \
            s += x10;                                   \
            s += x11;                                   \
            s += x12;                                   \
            s += x13;                                   \
            s += x14;                                   \
            s += x15;                                   \
            s += x16;                                   \
            s += x17;                                   \
                                                        \
            iir.set_ctx(ctx);                           \
            var r = callee(v0, v1, v5, v8);             \
                                                        \
            /* s = 175, r = 238 */                      \
            return s + r;                               \
        }                                               \
        function callee(v0, v1, v5, v8)                 \
        {                                               \
            "tachyon:static";                           \
            "tachyon:arg v0 pint";                      \
            "tachyon:arg v1 pint";                      \
            "tachyon:arg v5 pint";                      \
            "tachyon:arg v8 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            var x01 = v5 + pint(1);                     \
            var x02 = v5 + pint(2);                     \
            var x03 = v5 + pint(3);                     \
            var x04 = v5 + pint(4);                     \
            var x05 = v5 + pint(5);                     \
            var x06 = v5 + pint(6);                     \
            var x07 = v5 + pint(7);                     \
            var x08 = v5 + pint(8);                     \
            var x09 = v5 + pint(9);                     \
            var x10 = v5 + pint(10);                    \
            var x11 = v5 + pint(11);                    \
            var x12 = v5 + pint(12);                    \
            var x13 = v5 + pint(13);                    \
            var x14 = v5 + pint(14);                    \
            var x15 = v5 + pint(15);                    \
            var x16 = v5 + pint(16);                    \
            var x17 = v5 + pint(17);                    \
                                                        \
            var s = pint(0);                            \
            s += x01;                                   \
            s += x02;                                   \
            s += x03;                                   \
            s += x04;                                   \
            s += x05;                                   \
            s += x06;                                   \
            s += x07;                                   \
            s += x08;                                   \
            s += x09;                                   \
            s += x10;                                   \
            s += x11;                                   \
            s += x12;                                   \
            s += x13;                                   \
            s += x14;                                   \
            s += x15;                                   \
            s += x16;                                   \
            s += x17;                                   \
                                                        \
            return s;                                   \
        }                                               \
        ',
        408,
        [0, 1, 5, 8]
    );

    // JavaScript Fibonacci test (Tachyon function)
    test('                                              \
        function test(ctx, n)                           \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            var n = boxInt(n);                          \
                                                        \
            iir.set_ctx(ctx);                           \
            var r = fib(n);                             \
                                                        \
            return unboxInt(r);                         \
        }                                               \
        function fib(n)                                 \
        {                                               \
            "tachyon:static";                           \
                                                        \
            if (blt(n, 2) === pint(1))                  \
                return n;                               \
                                                        \
            var fnm1 = fib(bsub(n, 1));                 \
            var fnm2 = fib(bsub(n, 2));                 \
            return badd(fnm1, fnm2);                    \
        }                                               \
        function blt(x, y)                              \
        {                                               \
            "tachyon:static";                           \
            "tachyon:ret pint";                         \
                                                        \
            if (iir.if_lt(x, y))                        \
                return pint(1);                         \
            else                                        \
                return pint(0);                         \
        }                                               \
        function badd(x, y)                             \
        {                                               \
            "tachyon:static";                           \
                                                        \
            return iir.add(x, y);                       \
        }                                               \
        function bsub(x, y)                             \
        {                                               \
            "tachyon:static";                           \
                                                        \
            return iir.sub(x, y);                       \
        }                                               \
        ',
        55,
        [10]
    );

    // Regression test: infinite loop code
    test('                                              \
        function foo()                                  \
        {                                               \
            for (;;)                                    \
            {                                           \
            }                                           \
        }                                               \
        '
    );

    // Regression test: complex control flow and phi nodes
    test('                                                  \
        function foo(ptr)                                   \
        {                                                   \
            "tachyon:arg ptr rptr";                         \
                                                            \
            var x = pint(0);                                \
            var y = pint(0);                                \
                                                            \
            while (true)                                    \
            {                                               \
                var x = iir.load(IRType.pint, ptr, pint(0));\
                                                            \
                if (x !== pint(1))                          \
                    continue;                               \
                                                            \
                var y = x;                                  \
            }                                               \
        }                                                   \
        '
    );

    // Regression test: phi node steals live value's allocation
    test('                                              \
        function test(ctx, n)                           \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            iir.set_ctx(ctx);                           \
            return foo(n);                              \
        }                                               \
        function foo(n)                                 \
        {                                               \
            "tachyon:static";                           \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            var i = n;                                  \
                                                        \
            while (true)                                \
            {                                           \
                i++;                                    \
                                                        \
                if (i > n + pint(10))                   \
                    break;                              \
            }                                           \
                                                        \
            return i;                                   \
        }                                               \
        ',
        11,
        [0]
    );

    // Regression test: phi node crushes incoming temp allocation
    test('                                              \
        function foo(intVal)                            \
        {                                               \
            "tachyon:arg intVal pint";                  \
                                                        \
            var strLen = pint(0);                       \
            var neg = false;                            \
                                                        \
            if (intVal < pint(0))                       \
            {                                           \
                strLen = pint(1);                       \
                neg = true;                             \
            }                                           \
                                                        \
            var intVal2 = intVal;                       \
            while (intVal2 !== pint(0))                 \
            {                                           \
                strLen++;                               \
                intVal /= pint(2);                      \
            }                                           \
        }                                               \
        '
    );

    // Regression test: allocation of REX requiring operand in 32 bit
    test('                                              \
        function foo(strVal)                            \
        {                                               \
            var strLen = iir.icast(                     \
                IRType.pint,                            \
                get_str_size(strVal)                    \
            );                                          \
            var strPtr = malloc(strLen);                \
                                                        \
            for (var i = pint(0); i < strLen; i++)      \
            {                                           \
                var ch = get_str_data(strVal, i);       \
                var cCh = iir.icast(IRType.i8, ch);     \
                iir.store(IRType.i8, strPtr, i, cCh);   \
            }                                           \
        }                                               \
        '
    );

    // Regression test: function call corrupts locals
    test('                                              \
        function test(ctx, n)                           \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:noglobal";                         \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            return iir.call(                            \
                foo,                                    \
                UNDEFINED,                              \
                UNDEFINED,                              \
                ctx,                                    \
                n                                       \
            );                                          \
        }                                               \
        function foo(ctx, n)                            \
        {                                               \
            "tachyon:static";                           \
            "tachyon:noglobal";                         \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            iir.set_ctx(ctx);                           \
                                                        \
            bar1(n);                                    \
                                                        \
            return n + pint(1);                         \
        }                                               \
        function bar1(a1)                               \
        {                                               \
            "tachyon:static";                           \
            "tachyon:arg a1 pint";                      \
            "tachyon:ret pint";                         \
                                                        \
            var x01 = a1 + pint(1);                     \
            var x02 = a1 + pint(2);                     \
            var x03 = a1 + pint(3);                     \
                                                        \
            return x01 * x02 * x03;                     \
        }                                               \
        ',
        6,
        [5]
    );

    // Test of the code generation for call_apply
    test('                                              \
        function bar(a1, a2)                            \
        {                                               \
            "tachyon:static";                           \
                                                        \
            return a1;                                  \
        }                                               \
        function foo(fn, ths, vec, cnt)                 \
        {                                               \
            "tachyon:arg vec ref";                      \
            "tachyon:arg cnt pint";                     \
                                                        \
            return iir.call_apply(                      \
                bar,                                    \
                fn,                                     \
                ths,                                    \
                vec,                                    \
                cnt                                     \
            );                                          \
        }                                               \
        '
    );

    // Regression test: argument c (rcx) is corrupted by shifting
    test('                                              \
        function test(ctx, n, k, c)                     \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:arg k pint";                       \
            "tachyon:arg c pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            n = iir.icast(IRType.i32, n);               \
            k = iir.icast(IRType.i32, k);               \
                                                        \
            var r = n >> k;                             \
                                                        \
            if (c !== pint(0))                          \
                return c;                               \
                                                        \
            r = iir.icast(IRType.pint, r);              \
            return r;                                   \
        }                                               \
        ',
        3,
        [15, 2, 0]
    );

    // Regression test: context must be saved before C calls
    test('                                              \
        function test(ctx)                              \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:ret pint";                         \
                                                        \
            var c1 = ctx;                               \
            iir.set_ctx(c1);                            \
                                                        \
            iir.call_ffi(                               \
                callee,                                 \
                pint(1),                                \
                pint(1),                                \
                pint(1),                                \
                pint(1)                                 \
            );                                          \
                                                        \
            var c2 = iir.get_ctx();                     \
            if (c1 !== c2)                              \
                return pint(1);                         \
                                                        \
            var c3 = iir.call_ffi(callee2);             \
            if (c1 !== c3)                              \
                return pint(2);                         \
                                                        \
            return pint(0);                             \
        }                                               \
        function callee(a, b, c, d)                     \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:static";                           \
            "tachyon:arg a pint";                       \
            "tachyon:arg b pint";                       \
            "tachyon:arg c pint";                       \
            "tachyon:arg d pint";                       \
        }                                               \
        function callee2()                              \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:static";                           \
            "tachyon:ret rptr";                         \
                                                        \
            return iir.get_ctx();                       \
        }                                               \
        ',
        0,
        []
    );

    // Regression test: store/load of u8 datatype potentially broken
    test('                                              \
        function test(ctx, n)                           \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                     \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            n = iir.icast(IRType.u16, n);               \
            iir.store(IRType.u16, ctx, pint(16), n);    \
                                                        \
            var ptr = iir.icast(IRType.rptr, ctx);      \
                                                        \
            var r = iir.load(IRType.u8, ptr, pint(16)); \
            r = iir.icast(IRType.pint, r);              \
                                                        \
            return r;                                   \
        }                                               \
        ',
        47,
        [47]
    );

    // Regression test: bitwise and error
    test('                                              \
        function test(ctx, n)                           \
        {                                               \
            "tachyon:cproxy";                           \
            "tachyon:arg ctx rptr";                      \
            "tachyon:arg n pint";                       \
            "tachyon:ret pint";                         \
                                                        \
            var r = n & pint(255);                      \
                                                        \
            return r;                                   \
        }                                               \
        ',
        24,
        [24]
    );







    /*
    // TODO: 
    // Add unit tests for problematic compilation cases
    // Simplify problematic functions to minimum
    var ast = parse_src_file('test_backend.js', params);
    params.staticEnv.parseUnit(ast);
    var ir = unitToIR(ast, params);
    lowerIRFunc(ir, params);
    print(ir);
    backend.genCode(ir, params);
    */







    /*
    TODO: FP reg alloc, FP instrs

    Need FP parsing to get FP constants for testing
    Also need FP printing.

    FAddInstr
    FSubInstr
    ...?
    */




}

