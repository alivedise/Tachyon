/**
@fileOverview
Low-level utility functions for the run-time.

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010-2011 Maxime Chevalier-Boisvert, All Rights Reserved
*/

/**
Print an error string and stop the execution
*/
function error(errorStr)
{
    "tachyon:static";
    "tachyon:noglobal";

    print('*** RUN-TIME ERROR ***');
    print(errorStr);
    exit(0);
}

/**
Perform an assertion test
*/
function assert(testVal, errorStr)
{
    "tachyon:static";
    "tachyon:noglobal";

    if (testVal !== true)
    {
        error(errorStr);
    }
}

/**
Print values to the console
*/
function print(val)
{
    "tachyon:static";
    "tachyon:noglobal";

    // Convert the value to a string
    var strVal = boxToString(val);
       
    // Print the string
    var cstr = makeCString(strVal);
    printStr(cstr);
    freeCString(cstr);
}

/**
Test of an object is the global object
*/
function isGlobalObj(obj)
{
    "tachyon:inline";
    "tachyon:noglobal";

    // Get a reference to the global object
    var globalObj = get_ctx_globalobj(iir.get_ctx());

    // Test if our object is the global object
    return (obj === globalObj);
}

/**
Print information about the state of the Tachyon VM
*/
function printTachyonState()
{
    "tachyon:static";
    "tachyon:noglobal";

    var ctx = iir.get_ctx();

    var allocptr = get_ctx_allocptr(ctx);
    var heapSize = (allocptr - ctx) / pint(1024);

    var strtbl = get_ctx_strtbl(ctx);
    var numStrings = iir.icast(IRType.pint, get_strtbl_numstrs(strtbl));

    var globalobj = get_ctx_globalobj(ctx);
    var numGlobals = iir.icast(IRType.pint, get_obj_numprops(globalobj));

    print('Heap size  : ' + boxInt(heapSize) + ' KB');
    print('Num strings: ' + boxInt(numStrings));
    print('Num globals: ' + boxInt(numGlobals));
}
